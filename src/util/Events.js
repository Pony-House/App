import settings from '@src/client/state/settings';

export const MemberEventsList = [
  'join',
  'leave',

  'invite',
  'cancelInvite',
  'rejectInvite',

  'kick',
  'ban',
  'unban',

  'avatarSets',
  'avatarChanged',
  'avatarRemoved',

  'nameSets',
  'nameChanged',
  'nameRemoved',
];

export const memberEventAllowed = (item, ignoreNull = false) =>
  (typeof item !== 'string' && ignoreNull) ||
  (typeof item === 'string' &&
    ((item !== 'avatarSets' &&
      item !== 'avatarChanged' &&
      item !== 'avatarRemoved' &&
      item !== 'nameSets' &&
      item !== 'nameChanged' &&
      item !== 'nameRemoved') ||
      !settings.hideNickAvatarEvents) &&
    ((item !== 'leave' && item !== 'join') || !settings.hideMembershipEvents));
