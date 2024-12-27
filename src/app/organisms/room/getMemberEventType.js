function getMemberEventType(mEvent) {
  const type = mEvent.getType();
  const content = mEvent.getContent();
  const prevContent = mEvent.getPrevContent();

  const sender = mEvent.getSender();

  if (type !== 'm.room.pinned_events') {
    switch (content.membership) {
      // Invite
      case 'invite':
        return 'invite';
      // Ban
      case 'ban':
        return 'ban';

      // User events
      case 'join':
        if (prevContent.membership === 'join') {
          if (content.displayname !== prevContent.displayname) {
            // Name removed
            if (typeof content.displayname === 'undefined') return 'nameRemoved';
            // New name
            if (typeof prevContent.displayname === 'undefined') return 'nameSets';
            // Name changed
            return 'nameChanged';
          }
          if (content.avatar_url !== prevContent.avatar_url) {
            // Avatar removed
            if (typeof content.avatar_url === 'undefined') return 'avatarRemoved';
            // Avatar set
            if (typeof prevContent.avatar_url === 'undefined') return 'avatarSets';
            // Avatar changed
            return 'avatarChanged';
          }
          // What?
          return null;
        }
        // New join event
        return 'join';

      // Leave Events
      case 'leave':
        // Made by user
        if (sender === mEvent.getStateKey()) {
          switch (prevContent.membership) {
            // Reject Invite
            case 'invite':
              return 'rejectInvite';
            // Leave Message
            default:
              return 'leave';
          }
        }
        // Other
        switch (prevContent.membership) {
          // Cancel Invite
          case 'invite':
            return 'cancelInvite';
          // Ban?
          case 'ban':
            return 'unban';
          // sender is not target and made the target leave,
          // if not from invite/ban then this is a kick
          default:
            return 'kick';
        }

      // Nothing
      default:
        return null;
    }
  }
}

export default getMemberEventType;
