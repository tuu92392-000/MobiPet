// The bedside tablet: pet, goal, "I did it!" buttons, help, settings.
import { useEffect, useMemo, useRef, useState } from 'react';
import { BellRing, Gem, Mail, Settings, Shirt } from 'lucide-react';
import type { AccessoryId, Level, PatientSettings, PetChoice } from '@shared/types';
import type { LogResponse, PatientView, ThreadSummary } from '@shared/api';
import { isRestGoal, requiresAssistGate } from '@shared/jhhlm';
import type { ProgressResult } from '@shared/progression';
import { api, ApiError } from '../../api/client';
import { Celebration } from '../../journey/Celebration';
import { JourneyMap } from '../../journey/JourneyMap';
import { KeepsakeShelf } from '../../journey/KeepsakeShelf';
import { hasRewards, RewardCard, rewardText } from '../../journey/RewardCard';
import { Wardrobe } from '../../journey/Wardrobe';
import { makeT, type MsgKey } from '../../i18n';
import { useLiveRefresh } from '../../lib/live';
import { chime, setVolume, speak } from '../../lib/voice';
import { PetSvg, type PetAction } from '../../pets/PetSvg';
import { usePatientStore } from '../../store/patientStore';
import { ActivityButtons } from './ActivityButtons';
import { GoalCard } from './GoalCard';
import { DEFAULT_PET, PetSetup } from './PetSetup';
import { AssistGate, CallButtonCard } from './SafetyCards';
import { SettingsDialog } from './SettingsDialog';
import { BreathingGuide } from './BreathingGuide';
import { NudgeCard } from './NudgeCard';
import { TalkToPip } from './TalkToPip';
import { ChatFab } from './ChatFab';
import { PatientMessages } from './PatientMessages';
import { WelcomeBack } from './WelcomeBack';
import { MessageDelivery, messageText } from './MessageDelivery';

const ROOT_FONT = ['20px', '24px', '28px'];

function greetingKey(now: number): MsgKey {
  const h = new Date(now).getHours();
  if (h >= 5 && h < 12) return 'greeting.morning';
  if (h >= 12 && h < 17) return 'greeting.afternoon';
  if (h >= 17 && h < 22) return 'greeting.evening';
  return 'greeting.night';
}

export function PatientScreen({ patientId: id, wokeAt = null }: { patientId: string; wokeAt?: number | null }) {
  const { view, error, load, setView, clear } = usePatientStore();
  const [action, setAction] = useState<PetAction>('idle');
  const [announce, setAnnounce] = useState('');
  const [busy, setBusy] = useState(false);
  const [gateLevel, setGateLevel] = useState<Level | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shelfOpen, setShelfOpen] = useState(false);
  const [wardrobeOpen, setWardrobeOpen] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [breathingOpen, setBreathingOpen] = useState(false);
  const spokenNudge = useRef<string | null>(null);
  const chatFab = useRef<HTMLButtonElement>(null);
  // The floating button pulses for a nudge the patient hasn't opened the chat for yet.
  const [seenNudgeId, setSeenNudgeId] = useState<string | null>(null);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [welcomedAt, setWelcomedAt] = useState<number | null>(null);
  const [changePetOpen, setChangePetOpen] = useState(false);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const loadThreads = () => void api.get<ThreadSummary[]>('/messages/threads').then(setThreads).catch(() => undefined);
  useEffect(loadThreads, [id]);
  useLiveRefresh(id, loadThreads);
  const hasNewMessages = threads.some((x) => x.unread > 0);
  const [reward, setReward] = useState<ProgressResult | null>(null);
  const pendingReward = useRef<ProgressResult | null>(null);
  const actionTimer = useRef<number>();
  const rewardTimer = useRef<number>();

  useEffect(() => () => window.clearTimeout(rewardTimer.current), []);

  useEffect(() => {
    clear();
    void load(id);
  }, [id, load, clear]);
  // Nurse goal changes, confirmations, notes and family messages arrive live.
  useLiveRefresh(id, () => void load(id));
  // Ask the server whether a gentle nudge is due. It enforces every rule (max 1/hour, idle 2 h+,
  // not paused or snoozed, no open safety flag), so most checks return "skipped".
  const checkNudge = () => void api.post(`/patients/${id}/nudge`, { trigger: 'idle' }).catch(() => undefined);
  useEffect(checkNudge, [id]);
  useLiveRefresh(id, checkNudge, 2000);

  const settings = view?.patient.settings;
  const lang = settings?.language ?? 'en';
  const t = useMemo(() => makeT(lang), [lang]);

  useEffect(() => setVolume(settings?.volume ?? 0.6), [settings?.volume]);

  // Patient view uses a 20px minimum body size; text-size setting scales the whole layout.
  useEffect(() => {
    document.documentElement.style.fontSize = ROOT_FONT[(settings?.textSize ?? 1) - 1];
    document.documentElement.lang = lang;
    return () => {
      document.documentElement.style.fontSize = '';
      document.documentElement.lang = 'en';
    };
  }, [settings?.textSize, lang]);

  // React to changes that arrive live from elsewhere (a family visit walk, a demo scenario):
  // reaching this shift's goal celebrates; a new safety reply opens the call-button card.
  // Changes from this tablet's own taps are already handled where they happen.
  const ownChange = useRef(false);
  const seen = useRef<{ patientId: string; shiftId: string; met: boolean; safety: Set<string> } | null>(null);
  useEffect(() => {
    if (!view) return;
    const met = !isRestGoal(view.patient.goal) && view.summary.progress >= view.patient.goal.reps;
    const safety = view.chat.filter((c) => c.mode === 'safety').map((c) => c.id);
    const prev = seen.current;
    if (prev && prev.patientId === view.patient.id && !ownChange.current) {
      if (met && !prev.met && prev.shiftId === view.shift.id) {
        window.clearTimeout(actionTimer.current);
        setAction('celebrate');
        actionTimer.current = window.setTimeout(() => setAction('idle'), 1700);
        setCelebrating(true);
      }
      if (safety.some((id) => !prev.safety.has(id))) setHelpOpen(true);
    }
    ownChange.current = false;
    seen.current = { patientId: view.patient.id, shiftId: view.shift.id, met, safety: new Set(safety) };
  }, [view]);

  // Family messages wait until nothing else is on screen, then the pet delivers the oldest.
  // Pet setup opens for a new patient, from Settings, or when staff press "Help set up pet".
  const setupOpen = !!view && (!view.patient.pet || !!view.patient.petSetupRequested || changePetOpen);
  const welcoming = !setupOpen && wokeAt !== null && welcomedAt !== wokeAt && !!view?.patient.pet;
  const busyOverlay = setupOpen || welcoming || celebrating || chatOpen || messagesOpen || breathingOpen || helpOpen || gateLevel !== null || reward !== null || !view?.patient.pet;
  const nextMessage = busyOverlay ? null : ([...(view?.messages ?? [])].filter((m) => m.deliveredAt === null).sort((a, b) => a.at - b.at)[0] ?? null);
  const spokenMessage = useRef<string | null>(null);
  useEffect(() => {
    if (!nextMessage || spokenMessage.current === nextMessage.id || !view) return;
    spokenMessage.current = nextMessage.id;
    if (view.patient.settings.sound) chime();
    if (view.patient.settings.readAloud) {
      const t2 = makeT(view.patient.settings.language);
      speak(`${t2('delivery.title', { pet: view.patient.pet?.name ?? 'Pip' })} ${messageText(nextMessage, t2)}`, view.patient.settings.language);
    }
  }, [nextMessage, view]);

  // Read a new nudge aloud once, if the patient uses read-aloud.
  const nudge = view?.patient.activeNudge ?? null;
  useEffect(() => {
    if (!nudge || spokenNudge.current === nudge.id) return;
    spokenNudge.current = nudge.id;
    if (view?.patient.settings.readAloud) speak(nudge.text, view.patient.settings.language);
  }, [nudge, view?.patient.settings.readAloud, view?.patient.settings.language]);

  useEffect(() => {
    if (!announce) return;
    const timer = window.setTimeout(() => setAnnounce(''), 6000);
    return () => window.clearTimeout(timer);
  }, [announce]);

  if (!view) {
    return (
      <div className="p-8 text-center text-xl" role="status">
        <h1 className="sr-only">MobiPet</h1>
        {error ? (
          <>
            <p>{t('state.offline', { pet: 'Pip' })}</p>
            <button onClick={() => load(id)} className="mt-4 min-h-tap rounded-full bg-sage-deep px-8 font-bold text-cream">
              {t('state.retry')}
            </button>
          </>
        ) : (
          t('state.loading', { pet: 'Pip' })
        )}
      </div>
    );
  }

  const { patient, summary, progression } = view;
  const petName = patient.pet?.name ?? 'Pip';
  const rest = isRestGoal(patient.goal);

  function say(text: string) {
    setAnnounce(text);
    if (patient.settings.readAloud) speak(text, lang);
  }

  function play(next: PetAction) {
    window.clearTimeout(actionTimer.current);
    setAction(next);
    actionTimer.current = window.setTimeout(() => setAction('idle'), next === 'celebrate' ? 1700 : 1000);
  }

  async function logActivity(level: Level, assistConfirmed = false) {
    setBusy(true);
    try {
      const res = await api.post<LogResponse>(`/patients/${patient.id}/logs`, { level, assistConfirmed });
      ownChange.current = true;
      setView(res.view);
      if (patient.settings.sound) chime();
      const extra = hasRewards(res.progression) ? ` ${rewardText(res.progression, petName, t)}` : '';
      pendingReward.current = hasRewards(res.progression) ? res.progression : null;
      if (res.goalJustMet) {
        play('celebrate');
        setCelebrating(true);
        const praise = t('activity.goalMet', { pet: petName });
        setAnnounce(praise + extra);
        // Spoken praise is part of the celebration when read-aloud or sounds are on.
        if (patient.settings.readAloud || patient.settings.sound) speak(praise + extra, lang);
      } else {
        play('bounce');
        say(
          (res.progression.gained > 0
            ? `${t('activity.logged', { pet: petName })} ${t('activity.reported')}`
            : `${t('activity.loggedHome', { pet: petName })} ${t('activity.reported')}`) + extra,
        );
        // Let the pet finish walking the map before showing what it found.
        if (pendingReward.current) rewardTimer.current = window.setTimeout(showPendingReward, 1900);
      }
    } catch (e) {
      if (e instanceof ApiError && e.code === 'assist-required') setGateLevel(level);
      else say(t('state.offline', { pet: petName }));
    } finally {
      setBusy(false);
    }
  }

  function showPendingReward() {
    setReward(pendingReward.current);
    pendingReward.current = null;
  }

  async function wear(accessory: AccessoryId | null) {
    try {
      setView(await api.patch<PatientView>(`/patients/${patient.id}/pet`, { accessory }));
    } catch {
      say(t('state.offline', { pet: petName }));
    }
  }

  function onLog(level: Level) {
    if (requiresAssistGate(level, patient.clearance)) setGateLevel(level);
    else void logActivity(level);
  }

  async function needHelp() {
    setHelpOpen(true);
    if (patient.settings.readAloud) speak(`${t('help.title')}. ${t('help.body')}`, lang);
    try {
      await api.post(`/patients/${patient.id}/help`);
    } catch {
      // The card still tells the patient to press the physical call button.
    }
  }

  async function savePet(pet: PetChoice) {
    setChangePetOpen(false);
    try {
      setView(await api.patch<PatientView>(`/patients/${patient.id}/pet`, pet));
    } catch {
      say(t('state.offline', { pet: petName }));
    }
  }

  async function closeSetup() {
    setChangePetOpen(false);
    if (patient.petSetupRequested) setView(await api.post<PatientView>(`/patients/${patient.id}/pet/setup`, { open: false }));
  }

  async function changeSettings(patch: Partial<PatientSettings>) {
    setView({ ...view!, patient: { ...patient, settings: { ...patient.settings, ...patch } } });
    try {
      setView(await api.patch<PatientView>(`/patients/${patient.id}/settings`, patch));
    } catch {
      void load(patient.id);
    }
  }

  const helpButton = (
    <button
      onClick={needHelp}
      className="flex min-h-tap items-center gap-2 rounded-full border-4 border-alert bg-paper px-5 text-xl font-extrabold text-alert hover:bg-coral/30"
    >
      <BellRing aria-hidden /> {t('help.button')}
    </button>
  );

  return (
    // Bottom padding keeps the end of the page clear of the floating chat button.
    <div className={`min-h-[calc(100vh-5rem)] bg-cream pb-32 ${patient.settings.highContrast ? 'theme-contrast' : ''}`}>
      {/* Sticky top bar: "I need help" is always in the same place, whatever the scroll. */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-cream/95 px-4 py-2 backdrop-blur">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-3xl font-extrabold">{t(greetingKey(view.now), { name: patient.firstName })}</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex min-h-tap items-center gap-2 rounded-full border-4 border-line bg-paper px-4 text-lg font-bold"
          >
            <Settings aria-hidden /> {t('settings.button')}
          </button>
          <button
            onClick={() => setMessagesOpen(true)}
            className="relative flex min-h-tap items-center gap-2 rounded-full border-4 border-line bg-paper px-4 text-lg font-bold"
          >
            <Mail aria-hidden /> {t('messages.button')}
            {hasNewMessages && <span className="rounded-full bg-coral-deep px-2 text-base text-cream">{t('messages.new')}</span>}
          </button>
          {helpButton}
        </div>
      </div>

      {!patient.pet ? null : (
        // Goal and activity buttons sit in the left column so the floating chat button (bottom-right) never covers them.
        <div className="grid gap-4 p-4 md:grid-cols-[1.15fr_0.85fr]">
          <div className="flex flex-col gap-4 max-md:pr-24">
            <GoalCard view={view} t={t} />
            <ActivityButtons view={view} t={t} busy={busy} onLog={onLog} />
          </div>

          <section aria-label={petName} className="flex flex-col rounded-blob border-2 border-line bg-paper p-4">
            <div className="flex flex-1 items-center justify-center">
              <PetSvg
                species={patient.pet.species}
                palette={patient.pet.palette}
                mood={action === 'idle' ? summary.mood : 'excited'}
                stage={progression.stage}
                accessory={patient.pet.accessory}
                action={action}
                label={t('pet.label', {
                  pet: petName,
                  species: t(`species.${patient.pet.species}`),
                  mood: t(`moodWord.${action === 'idle' ? summary.mood : 'excited'}`),
                })}
                className="h-auto w-full max-w-[18rem]"
              />
            </div>
            <p className="mt-2 text-center text-xl">
              {rest ? t('mood.rest', { pet: petName }) : t(`mood.${action === 'idle' ? summary.mood : 'excited'}`, { pet: petName })}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={() => setShelfOpen(true)} className="flex min-h-tap items-center justify-center gap-2 rounded-full border-4 border-line bg-cream text-lg font-bold">
                <Gem aria-hidden size={22} /> {t('shelf.button')}
              </button>
              <button onClick={() => setWardrobeOpen(true)} className="flex min-h-tap items-center justify-center gap-2 rounded-full border-4 border-line bg-cream text-lg font-bold">
                <Shirt aria-hidden size={22} /> {t('wardrobe.button')}
              </button>
            </div>
          </section>

          <div className="md:col-span-2">
            <JourneyMap
              steps={progression.steps}
              region={progression.region}
              pet={patient.pet}
              mood={summary.mood}
              stage={progression.stage}
              keepsakes={progression.keepsakes}
              t={t}
            />
          </div>
        </div>
      )}

      {celebrating && (
        <Celebration
          t={t}
          onDone={() => {
            setCelebrating(false);
            if (pendingReward.current) showPendingReward();
          }}
        />
      )}
      <RewardCard result={reward} petName={petName} t={t} onClose={() => setReward(null)} />
      {patient.pet && (
        <>
          <ChatFab
            ref={chatFab}
            pet={patient.pet}
            t={t}
            open={chatOpen}
            hasNudge={!!nudge && nudge.id !== seenNudgeId}
            onOpen={() => {
              setSeenNudgeId(nudge?.id ?? null);
              setChatOpen(true);
            }}
          />
          <TalkToPip
            open={chatOpen}
            view={view}
            t={t}
            onClose={() => {
              setChatOpen(false);
              chatFab.current?.focus();
            }}
            onAction={(a) => {
              setChatOpen(false);
              if (a === 'call-button') {
                setHelpOpen(true);
                if (patient.settings.readAloud) speak(`${t('help.title')}. ${t('help.body')}`, lang);
              } else setBreathingOpen(true);
            }}
          />
          <BreathingGuide open={breathingOpen} pet={patient.pet} t={t} onClose={() => setBreathingOpen(false)} />
          <MessageDelivery
            message={nextMessage}
            pet={patient.pet}
            t={t}
            onDone={(messageId) => void api.post(`/patients/${patient.id}/messages/${messageId}/delivered`).then(() => load(patient.id))}
          />
          {nudge && !chatOpen && !celebrating && (
            <NudgeCard
              nudge={nudge}
              pet={patient.pet}
              t={t}
              onDismiss={(snooze) => void api.post(`/patients/${patient.id}/nudge/dismiss`, { snooze }).then(() => load(patient.id))}
            />
          )}
          <KeepsakeShelf open={shelfOpen} found={progression.keepsakes} t={t} onClose={() => setShelfOpen(false)} />
          <Wardrobe
            open={wardrobeOpen}
            pet={patient.pet}
            stage={progression.stage}
            t={t}
            onWear={wear}
            onClose={() => setWardrobeOpen(false)}
          />
        </>
      )}

      <p aria-live="polite" className="sr-only">{announce}</p>
      {announce && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 flex justify-center px-4" aria-hidden>
          <p className="rounded-full bg-ink px-6 py-3 text-lg text-cream shadow-lg">{announce}</p>
        </div>
      )}

      <AssistGate
        open={gateLevel !== null}
        t={t}
        onCancel={() => setGateLevel(null)}
        onConfirm={() => {
          const level = gateLevel!;
          setGateLevel(null);
          void logActivity(level, true);
        }}
      />
      {welcoming && patient.pet && (
        <WelcomeBack
          patient={patient}
          region={progression.region}
          t={t}
          onDone={() => setWelcomedAt(wokeAt)}
          onSound={(sound) => void changeSettings({ sound })}
        />
      )}
      {setupOpen && (
        <PetSetup
          open
          current={patient.pet}
          t={t}
          onSave={(pet) => void savePet(pet)}
          onSkip={() => void (patient.pet ? closeSetup() : savePet(DEFAULT_PET))}
        />
      )}
      <PatientMessages
        open={messagesOpen}
        patientId={patient.id}
        lang={lang}
        t={t}
        threads={threads}
        onClose={() => {
          setMessagesOpen(false);
          loadThreads();
        }}
        onBuddies={(buddies) => void changeSettings({ buddies })}
        onSent={(res) => {
          // A symptom in the patient's message: the message is still sent, and the call-button card opens.
          if (res.action === 'call-button') {
            setMessagesOpen(false);
            setHelpOpen(true);
            if (patient.settings.readAloud) speak(`${t('help.title')}. ${t('help.body')}`, lang);
          }
        }}
      />
      <CallButtonCard open={helpOpen} t={t} onClose={() => setHelpOpen(false)} />
      <SettingsDialog
        open={settingsOpen}
        settings={patient.settings}
        t={t}
        petName={petName}
        onChange={changeSettings}
        onClose={() => setSettingsOpen(false)}
        onChangePet={() => {
          setSettingsOpen(false);
          setChangePetOpen(true);
        }}
      />
    </div>
  );
}
