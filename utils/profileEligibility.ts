type AssessmentProfileUser = {
  username?: string | null;
  profile?: {
    gender?: string | null;
    date_of_birth?: string | null;
    height_cm?: number | null;
    weight_kg?: number | null;
  } | null;
} | null | undefined;

export const isAssessmentProfileComplete = (user: AssessmentProfileUser) => {
  const profile = user?.profile;

  return Boolean(
    user?.username?.trim()
    && profile?.gender?.trim()
    && profile.date_of_birth?.trim()
    && typeof profile.height_cm === 'number'
    && Number.isFinite(profile.height_cm)
    && profile.height_cm > 0
    && typeof profile.weight_kg === 'number'
    && Number.isFinite(profile.weight_kg)
    && profile.weight_kg > 0,
  );
};