
import React, { useRef } from 'react';

import navigation from '../../../client/state/navigation';
import cons from '../../../client/state/cons';
import initMatrix from '../../../client/initMatrix';


function DragDrop({ children, navWrapperRef, }) {

    const dropZone = useRef(null);

    function dragContainsFiles(e) {
        if (!e.dataTransfer.types) return false;

        for (let i = 0; i < e.dataTransfer.types.length; i += 1) {
            if (e.dataTransfer.types[i] === 'Files') return true;
        }
        return false;
    }

    function dropAllowed() {
        return !navigation.isRawModalVisible && dropZone.current && dropZone.current.classList.contains('drag-enabled');
    }

    function handleDragOver(e) {

        if (!dragContainsFiles(e)) return;

        e.preventDefault();

        if (!navigation.selectedRoomId) {
            e.dataTransfer.dropEffect = 'none';
        }

    }

    function handleDragEnter(e) {

        e.preventDefault();

        if (navigation.selectedRoomId && dragContainsFiles(e)) {
            dropZone.current.classList.add('drag-enabled');
        }

    }

    function handleDragLeave(e) {

        e.preventDefault();

        if (navigation.selectedRoomId && dragContainsFiles(e)) {
            dropZone.current.classList.remove('drag-enabled');
        }

    }

    function handleDrop(e) {

        e.preventDefault();
        if (!dropAllowed()) {
            console.log('Cancel!');
            return;
        }

        const roomId = navigation.selectedRoomId;
        if (!roomId) return;

        const { files } = e.dataTransfer;
        if (!files?.length) return;

        const file = files[0];
        initMatrix.roomsInput.setAttachment(roomId, file);
        initMatrix.roomsInput.emit(cons.events.roomsInput.ATTACHMENT_SET, file);
        if (dropZone.current) dropZone.current.classList.remove('drag-enabled');

    }

    return (
        <>
            <div ref={dropZone} id='dropzone' />
            <div
                ref={navWrapperRef}
                className="client-container"
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {children}
            </div>
        </>
    );

};

export default DragDrop;