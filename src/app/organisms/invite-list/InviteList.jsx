import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { dfAvatarSize } from '@src/util/matrixUtil';

import initMatrix from '../../../client/initMatrix';
import cons from '../../../client/state/cons';
import * as roomActions from '../../../client/action/room';
import { selectRoom, selectTab, selectRoomMode } from '../../../client/action/navigation';

import Button from '../../atoms/button/Button';
import Spinner from '../../atoms/spinner/Spinner';
import PopupWindow from '../../molecules/popup-window/PopupWindow';
import RoomTile from '../../molecules/room-tile/RoomTile';
import { setPrivacyRefuseRoom } from '../navigation/Sidebar/InviteSidebar';

function InviteList({ isOpen, onRequestClose }) {
  const [procInvite, changeProcInvite] = useState(new Set());

  function acceptInvite(roomId, isDM) {
    setPrivacyRefuseRoom(roomId, true);
    procInvite.add(roomId);
    changeProcInvite(new Set(Array.from(procInvite)));
    roomActions.join(roomId, isDM).catch((err) => alert(err.message, 'Join room error'));
  }
  function rejectInvite(roomId, isDM) {
    procInvite.add(roomId);
    changeProcInvite(new Set(Array.from(procInvite)));
    roomActions.leave(roomId, isDM).catch((err) => alert(err.message, 'Leave room error'));
  }
  function updateInviteList(roomId) {
    if (procInvite.has(roomId)) procInvite.delete(roomId);
    changeProcInvite(new Set(Array.from(procInvite)));

    const rl = initMatrix.roomList;
    const totalInvites = rl.inviteDirects.size + rl.inviteRooms.size + rl.inviteSpaces.size;
    const room = initMatrix.matrixClient.getRoom(roomId);
    const isRejected = room === null || room?.getMyMembership() !== 'join';
    if (!isRejected) {
      if (room.isSpaceRoom()) selectTab(roomId, true);
      else {
        selectRoomMode('room');
        selectRoom(roomId);
      }
      onRequestClose();
    }
    if (totalInvites === 0) onRequestClose();
  }

  useEffect(() => {
    initMatrix.roomList.on(cons.events.roomList.INVITELIST_UPDATED, updateInviteList);

    return () => {
      initMatrix.roomList.removeListener(cons.events.roomList.INVITELIST_UPDATED, updateInviteList);
    };
  }, [procInvite]);

  function renderRoomTile(roomId) {
    const mx = initMatrix.matrixClient;
    const mxcUrl = initMatrix.mxcUrl;
    const myRoom = mx.getRoom(roomId);
    if (!myRoom) return null;
    const roomName = myRoom.name;
    let roomAlias = myRoom.getCanonicalAlias();
    if (!roomAlias) roomAlias = myRoom.roomId;
    const inviterName = myRoom.getMember(mx.getUserId())?.events?.member?.getSender?.() ?? '';
    return (
      <RoomTile
        key={myRoom.roomId}
        name={roomName}
        avatarSrc={mxcUrl.getAvatarUrl(
          initMatrix.matrixClient.getRoom(roomId),
          dfAvatarSize,
          dfAvatarSize,
        )}
        avatarAnimSrc={mxcUrl.getAvatarUrl(initMatrix.matrixClient.getRoom(roomId))}
        id={roomAlias}
        inviterName={inviterName}
        options={
          procInvite.has(myRoom.roomId) ? (
            <Spinner className="small" />
          ) : (
            <div className="invite-btn__container">
              <Button className="me-2" onClick={() => rejectInvite(myRoom.roomId)}>
                Reject
              </Button>
              <Button
                className="ms-2"
                onClick={() => acceptInvite(myRoom.roomId)}
                variant="primary"
              >
                Accept
              </Button>
            </div>
          )
        }
      />
    );
  }

  return (
    <PopupWindow isOpen={isOpen} title="Invites" onRequestClose={onRequestClose}>
      <div className="invites-content">
        {initMatrix.roomList.inviteDirects.size !== 0 && (
          <div className="invites-content__subheading">
            <div className="very-small text-gray noselect">
              <strong>Direct Messages</strong>
            </div>
          </div>
        )}
        {Array.from(initMatrix.roomList.inviteDirects).map((roomId) => {
          const myRoom = initMatrix.matrixClient.getRoom(roomId);
          if (myRoom === null) return null;
          const roomName = myRoom.name;
          return (
            <RoomTile
              key={myRoom.roomId}
              name={roomName}
              id={myRoom.getDMInviter() || roomId}
              options={
                procInvite.has(myRoom.roomId) ? (
                  <Spinner className="small" />
                ) : (
                  <div className="invite-btn__container">
                    <Button className="me-2" onClick={() => rejectInvite(myRoom.roomId, true)}>
                      Reject
                    </Button>
                    <Button
                      className="ms-2"
                      onClick={() => acceptInvite(myRoom.roomId, true)}
                      variant="primary"
                    >
                      Accept
                    </Button>
                  </div>
                )
              }
            />
          );
        })}
        {initMatrix.roomList.inviteSpaces.size !== 0 && (
          <div className="invites-content__subheading">
            <div className="very-small text-gray noselect">
              <strong>Spaces</strong>
            </div>
          </div>
        )}
        {Array.from(initMatrix.roomList.inviteSpaces).map(renderRoomTile)}

        {initMatrix.roomList.inviteRooms.size !== 0 && (
          <div className="invites-content__subheading">
            <div className="very-small text-gray noselect">
              <strong>Rooms</strong>
            </div>
          </div>
        )}
        {Array.from(initMatrix.roomList.inviteRooms).map(renderRoomTile)}
      </div>
    </PopupWindow>
  );
}

InviteList.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onRequestClose: PropTypes.func.isRequired,
};

export default InviteList;
