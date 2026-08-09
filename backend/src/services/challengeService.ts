export type ChallengeState = 'upcoming' | 'active' | 'ended' | 'invalid';

export function getChallengeState(
  startDate: Date,
  endDate: Date,
  now = new Date(),
): ChallengeState {
  if (!(endDate.getTime() > startDate.getTime())) return 'invalid';
  if (now < startDate) return 'upcoming';
  if (now > endDate) return 'ended';
  return 'active';
}
