import $ from 'jquery';
import { opSetTimeout } from '@src/util/libs/timeoutLib';

const chatboxQuery = '#chatbox-scroll';
const roomViewQuery = '> .room-view__content #chatbox';
let height = null;

export default function tinyFixScrollChat(tinyI = 200) {
  for (let i = 0; i < tinyI; i++) {
    opSetTimeout(
      'tinyFixScrollChat',
      () => {
        if (typeof height === 'number') {
          const scrollBar = $(chatboxQuery);
          const roomView = scrollBar.find(roomViewQuery);

          const oldHeight = height;
          const newHeight = roomView.height();
          height = newHeight;

          const diffHeight = newHeight - oldHeight;
          if (diffHeight > 0)
            scrollBar.animate({ scrollTop: scrollBar.scrollTop() + diffHeight }, 0);
        }
      },
      10,
      1000,
    );
  }
}

export function setMediaHeight(value = null) {
  height =
    typeof value === 'number' && !Number.isNaN(value) && Number.isFinite(value) && value > -1
      ? value
      : $('#chatbox-scroll > .room-view__content #chatbox').height();
}
