import React from 'react';
import { PlaceholderMessage } from '../../../molecules/message/Message';

let loadingPage = false;
let forceDelay = false;

export function isLoadingTimeline() {
  return loadingPage;
}

export default function LoadingMsgPlaceholders({ keyName, count = 2 }) {
  const pl = [];
  const genPlaceholders = () => {
    for (let i = 0; i < count; i += 1) {
      pl.push(
        <PlaceholderMessage
          loadingPage={loadingPage}
          showAvatar
          key={`RoomViewContent-placeholder-${i}${keyName}`}
        />,
      );
    }
    return pl;
  };

  return (
    <React.Fragment key={`placeholder-container${keyName}-2`}>{genPlaceholders()}</React.Fragment>
  );
}
