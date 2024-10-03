## Not ready for production stuff

<hr/>

`src/client/state/navigation.js`

### roomSettingsToggled

    isRoomSettings
    forceScroll

### roomSelected

    selectedRoomId
    prevSelectedRoomId
    eventId
    forceScroll

### tabSelected

    selectedTab

### spaceSelected

    selectedSpaceId

### spaceSettingsOpened

    roomId
    tabText

### spaceManageOpened

    roomId

### spaceAddExistingOpened

    roomId

### roomSettingsToggled

    isRoomSettings
    tabText
    forceScroll

### RoomInfoUpdated

    roomInfo

### shortcutSpacesOpened

    <EMPTY>

### inviteListOpened

    <EMPTY>

### publicRoomsOpened

    searchTerm

### createRoomOpened

    isSpace
    parentId

### joinAliasOpened

    term

### inviteUserOpened

    roomId
    searchTerm

### profileViewerOpened

    userId
    roomId

### roomViewerOpened

    roomAlias/roomId
    originalRoomid
    isId

### changelogOpened

    version

### settingsOpened

    tabText

### navigationOpened

    <EMPTY>

### emojiboardOpened

    roomId
    cords
    requestEmojiCallback
    dom

### readReceiptsOpened

    roomId
    userIds

### viewSourceOpened

    event

### replyToClicked

    userId
    eventId
    body
    formattedBody

### searchOpened

    term

### reusableContextMenuOpened

    placement
    cords
    render
    afterClose

### reusableDialogOpened

    title
    render
    afterClose

### emojiVerificationOpened

    request
    targetDevice

### profileUpdated

    content

<hr/>

`src/client/state/AccountData.js`

### spaceShortcutUpdate

    roomId

### spaceShortcutUpdated

    roomId

### categorizeSpaceUpdated

    roomId

<hr/>

`src/util/AsyncSearch.js`

### searchResultSent

    findingList
    term
    config
