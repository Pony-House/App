# Yjs Doc

This is a doc with some basic instructions before you actually start using Yjs in your project. Pony House native compatibility only works with yMap, yArray, yText.

When you obtain data from a room, which is normally done in the way described below, you will already have access to yDoc.

```js
// Get the selected room function
import { getRoomInfo } from './src/app/organisms/room/RoomInfo';

// Get Room
const selectedRoom = getRoomInfo().roomTimeline;

// Start Ydoc
selectedRoom.initYdoc();

// Wait yDoc ready
await selectedRoom.ydocWait();

const yMap = selectedRoom.getYmap(id);
const yarray = selectedRoom.getYarray(id);
const yText = selectedRoom.getYtext(id);
```

Be aware that after executing any setTimeout, setInterval, or anything similar, you need to call the above functions again.
So that the client does not have any cache-related problems on the chatroom, the snapshot needs to clear the yDoc history, and this normally resets the yDoc. This function is designed exactly to prevent your application from being lost during this snapshot transaction.

After you know this factor, everything you already know about yDoc can be applied normally using the official yDoc docs.

https://docs.yjs.dev/api/shared-types

## Compatible Ydoc shared types

https://docs.yjs.dev/api/shared-types/y.map

https://docs.yjs.dev/api/shared-types/y.array

https://docs.yjs.dev/api/shared-types/y.text
