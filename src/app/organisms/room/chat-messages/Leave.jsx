import React from 'react';
import LibMessages from './LibMessages';
import { twemojifyReact } from '../../../../util/twemojify';

export default function LeaveMessage({ user, reason, date, eventId }) {
  const reasonMsg = typeof reason === 'string' ? `\nReason: ${reason}` : '';

  return (
    <>
      <LibMessages
        user={user}
        date={date}
        eventId={eventId}
        reason={reason}
        where="leave_user"
        defaultMessage={
          <>
            <strong>{twemojifyReact(user)}</strong>
            {' left the room.'}
            {twemojifyReact(reasonMsg)}
          </>
        }
      />

      {reasonMsg}
    </>
  );
}
