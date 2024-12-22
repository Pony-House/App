import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import $ from 'jquery';

import moment from '@src/util/libs/momentjs';
import windowEvents from '@src/util/libs/window';

import { setEventTimeline } from '@src/client/state/Timeline/functions';

import initMatrix from '../../../client/initMatrix';
import cons from '../../../client/state/cons';
import navigation from '../../../client/state/navigation';
import settings from '../../../client/state/settings';
import { diffMinutes, isInSameDay, Throttle } from '../../../util/common';
import { markAsRead } from '../../../client/action/notifications';

import Divider from '../../atoms/divider/Divider';
import ScrollView from '../../atoms/scroll/ScrollView';
import { Message } from '../../molecules/message/Message';
import TimelineChange from '../../molecules/message/TimelineChange';

import { useStore } from '../../hooks/useStore';
import { useForceUpdate } from '../../hooks/useForceUpdate';
import { parseTimelineChange } from './common';

import TimelineScroll, {
  PLACEHOLDER_COUNT,
  MAX_MSG_DIFF_MINUTES,
  SCROLL_TRIGGER_POS,
} from './TimelineScroll';

import EventLimit from './EventLimit';
import tinyFixScrollChat, { setMediaHeight } from '../../molecules/media/mediaFix';
import matrixAppearance, { getAppearance } from '../../../util/libs/appearance';

import handleOnClickCapture from './content/handleOnClickCapture';
import RoomIntroContainer from './content/RoomIntroContainer';
import LoadingMsgPlaceholders from './content/LoadingMsgPlaceholders';
import storageManager from '@src/util/libs/Localstorage';

function renderEvent(
  timelineSVRef,
  roomTimeline,
  mEvent,
  prevMEvent,
  isFocus,
  isEdit,
  setEdit,
  cancelEdit,
  isUserList,
  isDM,
  isGuest,
  disableActions,
  usernameHover,
  refRoomInput,
) {
  const isBodyOnly =
    prevMEvent !== null &&
    prevMEvent.getSender() === mEvent.getSender() &&
    prevMEvent.getType() !== 'm.room.member' &&
    prevMEvent.getType() !== 'm.room.create' &&
    diffMinutes(mEvent.getDate(), prevMEvent.getDate()) <= MAX_MSG_DIFF_MINUTES;
  const timestamp = mEvent.getTs();

  tinyFixScrollChat();
  const eventType = mEvent.getType();
  if (eventType === 'm.room.member' || eventType === 'm.room.pinned_events') {
    const timelineChange = parseTimelineChange(mEvent);
    if (timelineChange === null) return <div key={mEvent.getId()} />;
    return (
      <TimelineChange
        key={mEvent.getId()}
        variant={timelineChange.variant}
        content={timelineChange.content}
        timestamp={timestamp}
      />
    );
  }

  return (
    <Message
      refRoomInput={refRoomInput}
      usernameHover={usernameHover}
      isGuest={isGuest}
      disableActions={disableActions}
      isDM={isDM}
      isUserList={isUserList}
      timelineSVRef={timelineSVRef}
      key={mEvent.getId()}
      mEvent={mEvent}
      isBodyOnly={isBodyOnly}
      roomTimeline={roomTimeline}
      focus={isFocus}
      fullTime={false}
      isEdit={isEdit}
      setEdit={setEdit}
      cancelEdit={cancelEdit}
    />
  );
}

function useTimeline(roomTimeline, eventId, readUptoEvtStore, eventLimitRef) {
  const [timelineInfo, setTimelineInfo] = useState(null);

  useEffect(() => {
    const limit = eventLimitRef.current;
    if (limit) {
      const initTimeline = (eId) => {
        console.log(
          `[timeline] [${roomTimeline.roomId}] Ready${eId ? ` in event id "${eId}"` : ''}!`,
        );
        // NOTICE: eId can be id of readUpto, reply or specific event.
        // readUpTo: when user click jump to unread message button.
        // reply: when user click reply from timeline.
        // specific event when user open a link of event. behave same as ^^^^
        const readUpToId = roomTimeline.getReadUpToEventId();
        let focusEventIndex = -1;
        const isSpecificEvent = eId && eId !== readUpToId;

        if (isSpecificEvent) {
          focusEventIndex = roomTimeline.getEventIndex(eId);
        }
        if (!readUptoEvtStore.getItem() && roomTimeline.hasEventInTimeline(readUpToId)) {
          // either opening live timeline or jump to unread.
          readUptoEvtStore.setItem(roomTimeline.findEventByIdInTimelineSet(readUpToId));
        }
        if (readUptoEvtStore.getItem() && !isSpecificEvent) {
          focusEventIndex = roomTimeline.getUnreadEventIndex(readUptoEvtStore.getItem().getId());
        }

        if (focusEventIndex > -1) {
          limit.setFrom(focusEventIndex - Math.round(limit.maxEvents / 2));
        } else {
          limit.setFrom(roomTimeline.timeline.length - limit.maxEvents);
        }

        setTimelineInfo({ focusEventId: isSpecificEvent, eId: eId || null });
      };

      roomTimeline.on(cons.events.roomTimeline.READY, initTimeline);
      setEventTimeline(roomTimeline, eventId);
      return () => {
        roomTimeline.removeListener(cons.events.roomTimeline.READY, initTimeline);
        limit.setFrom(0);
      };
    }
  }, [roomTimeline, eventId]);

  return timelineInfo;
}

function usePaginate(roomTimeline, readUptoEvtStore, timelineScrollRef, eventLimitRef) {
  const [info, setInfo] = useState(null);
  const [pageLimit, setPageLimit] = useState(getAppearance('pageLimit'));

  useEffect(() => {
    const updatePageLimit = (value) => setPageLimit(value);
    matrixAppearance.on('pageLimit', updatePageLimit);

    return () => {
      matrixAppearance.off('pageLimit', updatePageLimit);
    };
  });

  useEffect(() => {
    if (eventLimitRef.current) {
      const handlePaginatedFromServer = (backwards, loaded) => {
        const limit = eventLimitRef.current;
        if (loaded === 0) return;
        if (!readUptoEvtStore.getItem()) {
          const readUpToId = roomTimeline.getReadUpToEventId();
          readUptoEvtStore.setItem(roomTimeline.findEventByIdInTimelineSet(readUpToId));
        }
        limit.paginate(backwards, pageLimit, roomTimeline.timeline.length);
        setTimeout(() =>
          setInfo({
            backwards,
            loaded,
          }),
        );
      };
      roomTimeline.on(cons.events.roomTimeline.PAGINATED, handlePaginatedFromServer);
      return () => {
        roomTimeline.removeListener(cons.events.roomTimeline.PAGINATED, handlePaginatedFromServer);
      };
    }
  }, [roomTimeline]);

  const autoPaginate = useCallback(async () => {
    if (timelineScrollRef.current && eventLimitRef.current) {
      const timelineScroll = timelineScrollRef.current;

      if (roomTimeline.isOngoingPagination) {
        setMediaHeight();
        return;
      }

      const tLength =
        roomTimeline && roomTimeline.timeline && typeof roomTimeline.timeline.length === 'number'
          ? roomTimeline.timeline.length
          : 0;

      // Paginate scroll
      if (timelineScroll) {
        // Top page
        if (timelineScroll.bottom < SCROLL_TRIGGER_POS) {
          if (roomTimeline.canLoadNextPage() && roomTimeline.canPaginateForward()) {
            await roomTimeline.paginateTimeline(false);
            setMediaHeight();
            return;
          }
        }

        // Bottom page
        if (timelineScroll.top < SCROLL_TRIGGER_POS || roomTimeline.timeline.length < 1) {
          if (roomTimeline.canLoadNextPage() && roomTimeline.canPaginateBackward()) {
            await roomTimeline.paginateTimeline(true);
          }
        }
      }

      setMediaHeight();
    }
  }, [roomTimeline]);

  return [info, autoPaginate];
}

function useHandleScroll(
  roomTimeline,
  autoPaginate,
  readUptoEvtStore,
  forceUpdateLimit,
  timelineScrollRef,
  eventLimitRef,
) {
  // During each scrol attempt, this function is called automatically
  const handleScroll = useCallback(() => {
    const timelineScroll = timelineScrollRef.current;
    const limit = eventLimitRef.current;
    if (timelineScroll) {
      requestAnimationFrame(() => {
        // emit event to toggle scrollToBottom button visibility
        const isAtBottom =
          timelineScroll.bottom < 16 &&
          !roomTimeline.canPaginateForward() &&
          limit.length >= roomTimeline.timeline.length;

        roomTimeline.emit(cons.events.roomTimeline.AT_BOTTOM, isAtBottom);
        if (isAtBottom && readUptoEvtStore.getItem()) {
          requestAnimationFrame(() => markAsRead(roomTimeline.roomId, roomTimeline.threadId));
        }
      });

      autoPaginate();
    }
  }, [roomTimeline]);

  const handleScrollToLive = useCallback(() => {
    const timelineScroll = timelineScrollRef.current;
    if (timelineScroll) {
      const limit = eventLimitRef.current;
      if (readUptoEvtStore.getItem()) {
        requestAnimationFrame(() => markAsRead(roomTimeline.roomId, roomTimeline.threadId));
      }

      if (roomTimeline.isServingLiveTimeline()) {
        limit.setFrom(roomTimeline.timeline.length - limit.maxEvents);
        if (timelineScroll) timelineScroll.scrollToBottom();
        forceUpdateLimit();
        return;
      }

      roomTimeline.loadLiveTimeline();
    }
  }, [roomTimeline]);

  return [handleScroll, handleScrollToLive];
}

function useEventArrive(roomTimeline, readUptoEvtStore, timelineScrollRef, eventLimitRef) {
  const myUserId = initMatrix.matrixClient.getUserId();
  const [newEvent, setEvent] = useState(null);

  useEffect(() => {
    const timelineScroll = timelineScrollRef.current;
    if (timelineScroll) {
      const limit = eventLimitRef.current;
      const trySendReadReceipt = (event) => {
        if (myUserId === event.getSender()) {
          requestAnimationFrame(() => markAsRead(roomTimeline.roomId, roomTimeline.threadId));
          return;
        }

        const readUpToEvent = readUptoEvtStore.getItem();
        const readUpToId = roomTimeline.getReadUpToEventId();
        const isUnread = readUpToEvent ? readUpToEvent?.getId() === readUpToId : true;

        if (isUnread === false) {
          if (
            document.visibilityState === 'visible' &&
            timelineScroll &&
            timelineScroll.bottom < 16
          ) {
            requestAnimationFrame(() => markAsRead(roomTimeline.roomId, roomTimeline.threadId));
          } else {
            readUptoEvtStore.setItem(roomTimeline.findEventByIdInTimelineSet(readUpToId));
          }
          return;
        }

        const { timeline } = roomTimeline;
        const unreadMsgIsLast =
          timeline[timeline.length - 2] && timeline[timeline.length - 2].getId() === readUpToId;
        if (unreadMsgIsLast) {
          requestAnimationFrame(() => markAsRead(roomTimeline.roomId, roomTimeline.threadId));
        }
      };

      const handleEvent = (event) => {
        const tLength =
          roomTimeline && roomTimeline.timeline && typeof roomTimeline.timeline.length === 'number'
            ? roomTimeline.timeline.length
            : 0;
        const isViewingLive = roomTimeline.isServingLiveTimeline() && limit.length >= tLength - 1;
        const isAttached = timelineScroll.bottom < SCROLL_TRIGGER_POS;

        if (isViewingLive && isAttached && document.hasFocus()) {
          limit.setFrom(tLength - limit.maxEvents);
          trySendReadReceipt(event);
          setEvent(event);
          return;
        }

        const isRelates =
          event.getType() === 'm.reaction' || event.getRelation()?.rel_type === 'm.replace';
        if (isRelates) {
          setEvent(event);
          return;
        }

        if (isViewingLive) {
          // This stateUpdate will help to put the
          // loading msg placeholder at bottom
          setEvent(event);
        }
      };

      const handleEventRedact = (event) => setEvent(event);

      roomTimeline.on(cons.events.roomTimeline.EVENT, handleEvent);
      roomTimeline.on(cons.events.roomTimeline.EVENT_REDACTED, handleEventRedact);

      return () => {
        roomTimeline.removeListener(cons.events.roomTimeline.EVENT, handleEvent);
        roomTimeline.removeListener(cons.events.roomTimeline.EVENT_REDACTED, handleEventRedact);
      };
    }
  }, [roomTimeline]);

  return newEvent;
}

let jumpToItemIndex = -1;

function RoomViewContent({
  roomId = null,
  eventId = null,
  roomTimeline,
  isUserList,
  isGuest = false,
  disableActions = false,
  usernameHover,
  refRoomInput,
  isLoading,
}) {
  const [throttle] = useState(new Throttle());
  const [pageLimit, setPageLimit] = useState(getAppearance('pageLimit'));

  const timelineSVRef = useRef(null);
  const timelineScrollRef = useRef(null);
  const eventLimitRef = useRef(null);
  const [editEventId, setEditEventId] = useState(null);
  const cancelEdit = () => setEditEventId(null);

  const [, setHideMembership] = useState(settings.hideMembershipEvents);
  const [, setHideAvatarEvents] = useState(settings.hideNickAvatarEvents);

  const readUptoEvtStore = useStore(roomTimeline);
  const [onLimitUpdate, forceUpdateLimit] = useForceUpdate();

  // Timeline Info
  const timelineInfo = useTimeline(roomTimeline, eventId, readUptoEvtStore, eventLimitRef);
  const [paginateInfo, autoPaginate] = usePaginate(
    roomTimeline,
    readUptoEvtStore,
    timelineScrollRef,
    eventLimitRef,
  );

  // Scroll data
  const [handleScroll, handleScrollToLive] = useHandleScroll(
    roomTimeline,
    autoPaginate,
    readUptoEvtStore,
    forceUpdateLimit,
    timelineScrollRef,
    eventLimitRef,
  );

  // Event detector
  const newEvent = useEventArrive(roomTimeline, readUptoEvtStore, timelineScrollRef, eventLimitRef);

  // The timeline
  const { timeline } = roomTimeline;
  const tmValue = `${roomTimeline.roomId}${roomTimeline.threadId ? `:${roomTimeline.threadId}` : ''}`;

  useLayoutEffect(() => {
    if (!isLoading && !roomTimeline.initialized) {
      timelineScrollRef.current = new TimelineScroll(timelineSVRef.current);
      eventLimitRef.current = new EventLimit();
    }
  });

  // when active timeline changes
  useEffect(() => {
    if (!roomTimeline.initialized) return;
    const timelineScroll = timelineScrollRef.current;
    if (timelineScroll) {
      if (timeline.length > 0) {
        if (jumpToItemIndex === -1) {
          timelineScroll.scrollToBottom();
        } else {
          timelineScroll.scrollToIndex(jumpToItemIndex, 80);
        }

        if (timelineScroll.bottom < 16 && !roomTimeline.canPaginateForward()) {
          const readUpToId = roomTimeline.getReadUpToEventId();
          if (readUptoEvtStore.getItem()?.getId() === readUpToId || readUpToId === null) {
            requestAnimationFrame(() => markAsRead(roomTimeline.roomId, roomTimeline.threadId));
          }
        }

        jumpToItemIndex = -1;
      }

      autoPaginate();

      tinyFixScrollChat();
      roomTimeline.on(cons.events.roomTimeline.SCROLL_TO_LIVE, handleScrollToLive);
      return () => {
        if (timelineSVRef.current === null) return;
        roomTimeline.removeListener(cons.events.roomTimeline.SCROLL_TO_LIVE, handleScrollToLive);
      };
    }
  }, [timelineInfo]);

  // when paginating from server
  useEffect(() => {
    if (!roomTimeline.initialized) return;

    const timelineScroll = timelineScrollRef.current;
    if (timelineScroll) {
      timelineScroll.tryRestoringScroll();

      autoPaginate();
    }
  }, [paginateInfo]);

  // when paginating locally
  useEffect(() => {
    if (!roomTimeline.initialized) return;

    const timelineScroll = timelineScrollRef.current;
    if (timelineScroll) {
      timelineScroll.tryRestoringScroll();
    }
  }, [onLimitUpdate]);

  useEffect(() => {
    const timelineScroll = timelineScrollRef.current;
    if (!timelineScroll || !roomTimeline.initialized) return;

    if (
      timelineScroll.bottom < 16 &&
      !roomTimeline.canPaginateForward() &&
      document.visibilityState === 'visible'
    ) {
      timelineScroll.scrollToBottom();
    } else {
      timelineScroll.tryRestoringScroll();
    }
  }, [newEvent]);

  // Get chat config updates
  useEffect(() => {
    if (!roomTimeline.initialized) return;
    const toggleMembership = (hideMembershipEvents) => {
      setHideMembership(hideMembershipEvents);
    };
    const toggleAvatarEvents = (hideNickAvatarEvents) => {
      setHideAvatarEvents(hideNickAvatarEvents);
    };

    settings.on(cons.events.settings.MEMBERSHIP_EVENTS_TOGGLED, toggleMembership);
    settings.on(cons.events.settings.NICKAVATAR_EVENTS_TOGGLED, toggleAvatarEvents);
    return () => {
      settings.removeListener(cons.events.settings.MEMBERSHIP_EVENTS_TOGGLED, toggleMembership);
      settings.removeListener(cons.events.settings.NICKAVATAR_EVENTS_TOGGLED, toggleAvatarEvents);
    };
  });

  const listenKeyArrowUp = useCallback(
    (e) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key !== 'ArrowUp') return;
      if (navigation.isRawModalVisible) return;

      if (document.activeElement.id !== 'message-textarea') return;
      if (document.activeElement.value !== '') return;

      const { timeline: tl, activeTimeline, liveTimeline, matrixClient: mx } = roomTimeline;
      const limit = eventLimitRef.current;
      if (activeTimeline !== liveTimeline) return;
      if (tl.length > limit.length) return;
      if (!limit) return;

      e.preventDefault();

      const mTypes = ['m.text'];
      for (let i = tl.length - 1; i >= 0; i -= 1) {
        const mE = tl[i];

        if (
          mE.getSender() === mx.getUserId() &&
          mE.getType() === 'm.room.message' &&
          mTypes.includes(mE.getContent()?.msgtype)
        ) {
          setEditEventId(mE.getId());
          return;
        }
      }
    },
    [roomTimeline],
  );

  // escape to scroll down and mark as read
  const listenKeyEscape = useCallback(
    (e) => {
      if (e.key !== 'Escape') return;
      if (editEventId !== null) return;
      roomTimeline.emit(cons.events.roomTimeline.SCROLL_TO_LIVE);
      // hide "scroll to bottom"
      roomTimeline.emit(cons.events.roomTimeline.AT_BOTTOM, true);
    },
    [editEventId, roomTimeline],
  );

  useEffect(() => {
    document.body.addEventListener('keydown', listenKeyArrowUp);
    document.body.addEventListener('keydown', listenKeyEscape);
    return () => {
      document.body.removeEventListener('keydown', listenKeyArrowUp);
      document.body.removeEventListener('keydown', listenKeyEscape);
    };
  }, [listenKeyArrowUp, listenKeyEscape]);

  const handleTimelineScroll = (event) => {
    const timelineScroll = timelineScrollRef.current;
    if (timelineScroll) {
      const timelineSV = $(timelineSVRef.current);
      if ((!event || !event.target) && timelineSV.length < 1) return;

      throttle._(() => {
        const backwards = timelineScroll?.calcScroll();
        if (typeof backwards !== 'boolean') return;
        handleScroll(backwards);
      }, 200)();
    }
  };

  const handleTimelineScrollJquery = (event) => handleTimelineScroll(event.originalEvent);
  useEffect(() => {
    const timelineSV = $(timelineSVRef.current);
    timelineSV.on('scroll', handleTimelineScrollJquery);
    $('body').on('keydown', listenKeyArrowUp);
    timelineSV.trigger('scroll');

    return () => {
      $('body').off('keydown', listenKeyArrowUp);
      timelineSV.off('scroll', handleTimelineScrollJquery);
    };
  }, [listenKeyArrowUp]);

  useEffect(() => {
    const forceUpdateTime = () => {
      if (roomTimeline && roomTimeline.canPaginateForward()) {
        forceUpdateLimit();
      }
    };

    windowEvents.on('setWindowVisible', forceUpdateTime);
    return () => {
      windowEvents.off('setWindowVisible', forceUpdateTime);
    };
  });

  // Each time the timeline is loaded, this function is called
  const renderTimeline = () => {
    // Prepare timeline data
    const tl = [];
    const limit = eventLimitRef.current;
    if (limit === null) return [];

    // More data
    let itemCountIndex = 0;
    jumpToItemIndex = -1;
    const readUptoEvent = readUptoEvtStore.getItem();
    let unreadDivider = false;

    // Is DM
    const isDM = initMatrix.roomList && initMatrix.roomList.directs.has(roomTimeline.roomId);

    // Need pagination backward
    if (roomTimeline.canPaginateBackward() || limit.from > 0) {
      if (roomTimeline.canLoadNextPage() && !isGuest)
        tl.push(
          <LoadingMsgPlaceholders
            keyName="chatscroll-1"
            key="chatscroll-1"
            count={PLACEHOLDER_COUNT}
          />,
        );
      itemCountIndex += PLACEHOLDER_COUNT;
    }

    // Read limit timeline
    for (let i = limit.from; i < limit.length; i += 1) {
      if (i >= timeline.length) break;
      const mEvent = timeline[i];
      const prevMEvent = timeline[i - 1] ?? null;

      if (i === 0 && !roomTimeline.canPaginateBackward()) {
        if (mEvent.getType() === 'm.room.create') {
          tl.push(
            <RoomIntroContainer key={mEvent.getId()} event={mEvent} timeline={roomTimeline} />,
          );
          itemCountIndex += 1;
          // eslint-disable-next-line no-continue
          continue;
        } else {
          tl.push(<RoomIntroContainer key="room-intro" event={null} timeline={roomTimeline} />);
          itemCountIndex += 1;
        }
      }

      let isNewEvent = false;
      if (!unreadDivider) {
        unreadDivider =
          readUptoEvent &&
          prevMEvent?.getTs() <= readUptoEvent.getTs() &&
          readUptoEvent.getTs() < mEvent.getTs();
        if (unreadDivider) {
          isNewEvent = true;
          tl.push(
            <Divider
              key={`new-${mEvent.getId()}`}
              thread={mEvent.thread}
              variant="bg"
              text="New messages"
            />,
          );
          itemCountIndex += 1;
          if (jumpToItemIndex === -1) jumpToItemIndex = itemCountIndex;
        }
      }
      const dayDivider = prevMEvent && !isInSameDay(mEvent.getDate(), prevMEvent.getDate());
      if (dayDivider) {
        tl.push(
          <Divider
            thread={mEvent.thread}
            variant="bg"
            key={`divider-${mEvent.getId()}`}
            text={`${moment(mEvent.getDate()).format('MMMM DD, YYYY')}`}
          />,
        );
        itemCountIndex += 1;
      }

      if (timelineInfo === null) {
        return [];
      }
      const focusEventId = timelineInfo?.focusEventId || false;
      const focusId = timelineInfo?.eId || null;
      const isFocus = focusEventId && focusId === mEvent.getId();
      if (isFocus) jumpToItemIndex = itemCountIndex;

      tl.push(
        renderEvent(
          timelineSVRef,
          roomTimeline,
          mEvent,
          isNewEvent ? null : prevMEvent,
          isFocus,
          editEventId === mEvent.getId(),
          setEditEventId,
          cancelEdit,
          isUserList,
          isDM,
          isGuest,
          disableActions,
          usernameHover,
          refRoomInput,
        ),
      );
      itemCountIndex += 1;
    }

    // Need pagination forward
    if (roomTimeline.canPaginateForward() || limit.length < timeline.length) {
      if (roomTimeline.canLoadNextPage() && !isGuest)
        tl.push(
          <LoadingMsgPlaceholders
            keyName="chatscroll-2"
            key="chatscroll-2"
            count={PLACEHOLDER_COUNT}
          />,
        );
    }

    if (tl.length < 1 && isGuest) {
      tl.push(<center className="small p-3">Empty Timeline</center>);
    }
    return tl;
  };

  const phMsgQuery = '#chatbox > tbody > tr.ph-msg:not(.no-loading)';
  const noLoadingPageButton = () => {
    const target = $(phMsgQuery);
    target.removeClass('no-loading').off('click', noLoadingPageButton);
    forceUpdateLimit();
  };

  useEffect(() => {
    const updatePageLimit = (value) => setPageLimit(value);
    const handleRoomSyncUpdate = (syncTimelineCache) => {
      if (
        roomTimeline.roomId !== syncTimelineCache.roomId &&
        (!roomTimeline.threadId || roomTimeline.threadId !== syncTimelineCache.threadId)
      )
        return;
      forceUpdateLimit();
    };
    matrixAppearance.on('pageLimit', updatePageLimit);
    storageManager.on('timelineTmLastEventStatus', handleRoomSyncUpdate);
    return () => {
      matrixAppearance.off('pageLimit', updatePageLimit);
      storageManager.off('timelineTmLastEventStatus', handleRoomSyncUpdate);
    };
  });

  useEffect(() => {
    const forceTinyUpdate = () => forceUpdateLimit();
    if (roomTimeline)
      roomTimeline.on(cons.events.roomTimeline.TIMELINE_INIT_UPDATED, forceTinyUpdate);
    return () => {
      if (roomTimeline)
        roomTimeline.off(cons.events.roomTimeline.TIMELINE_INIT_UPDATED, forceTinyUpdate);
    };
  });

  return (
    <ScrollView id="chatbox-scroll" ref={timelineSVRef} autoHide>
      <div className="room-view__content" onClick={handleOnClickCapture}>
        <div className="timeline__wrapper">
          <table className="table table-borderless table-hover align-middle m-0" id="chatbox">
            <tbody>
              {!isLoading && roomTimeline.initialized && !roomTimeline.isRoomSyncingTmLast() ? (
                renderTimeline(isUserList)
              ) : (
                <LoadingMsgPlaceholders
                  keyName="chatscroll-loading"
                  key="chatscroll-loading"
                  count={3}
                />
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ScrollView>
  );
}

RoomViewContent.propTypes = {
  roomId: PropTypes.string,
  eventId: PropTypes.string,
  isGuest: PropTypes.bool,
  disableActions: PropTypes.bool,
  roomTimeline: PropTypes.shape({}).isRequired,
};

export default RoomViewContent;
