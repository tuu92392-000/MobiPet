// Feature flags. A feature that is only partly built stays off so no broken UI is ever visible in the demo.
export const features = {} as const;

export type FeatureName = keyof typeof features;
