import clone from 'clone';
import { generateApiKey } from 'generate-api-key';
import { objType } from 'for-promise/utils/lib.mjs';
import { MemberEventsList, memberEventAllowed } from '../../Events';

export const genKey = () => generateApiKey().replace(/\~/g, 'pud');
/* const getRoomValueId = (roomId, threadId) =>
  `${roomId}${typeof threadId === 'string' ? `:${threadId}` : ''}`; */
export const getRoomValueId = (roomId) => roomId;

export const finishWhereDbPrepare = (memberType, threadId, data, existMemberType = false) => {
  if (!Array.isArray(data.where)) data.where = [data.where];
  if (typeof threadId === 'string' && data.where.thread_id !== 'NULL') {
    data.where.push({
      thread_id: threadId,
      or: {
        event_id: threadId,
      },
    });
  }

  if (memberType || existMemberType) {
    const memberValue =
      typeof memberType === 'string' ||
      (typeof memberType === 'boolean' && memberType === true) ||
      Array.isArray(memberType)
        ? !Array.isArray(memberType)
          ? [memberType]
          : memberType
        : [];

    for (const item in memberValue) if (memberValue[item] === null) memberValue[item] = 'NULL';

    const firstInsert = (value, insertDefault = true) => {
      data.where[0].member_type = { in: [] };
      if (insertDefault) secondInsert('NULL');
      secondInsert(value);
    };

    const secondInsert = (value) => {
      data.where[0].member_type.in.push(value);
    };

    if (memberValue.length < 1) {
      for (const item in MemberEventsList) {
        if (memberEventAllowed(MemberEventsList[item])) {
          if (data.where[0].member_type) {
            secondInsert(MemberEventsList[item]);
          } else {
            firstInsert(MemberEventsList[item]);
          }
        }
      }
    } else {
      for (const item in memberValue) {
        if (data.where[0].member_type) {
          secondInsert(memberValue[item]);
        } else {
          firstInsert(memberValue[item], false);
        }
      }
    }
  }
};

export const insertObjWhere = (data, name, obj) => {
  if (objType(obj, 'object')) {
    for (const item in obj) {
      data.where[`${name}.${item}`] = obj[item];
    }
  }
};

export const addCustomSearch = (where, items) => {
  if (objType(items)) {
    for (const name in items) {
      const type = objType(items[name]);
      if (type === 'string' || type === 'array' || type === 'object') where[name] = items[name];
      else if (type === 'object') {
        for (const item in items[name]) {
          where[name] = items[name][item];
        }
      }
    }
  }
};

export const objWhereChecker = (join, dataCheck = {}, isClone = false) => {
  const newJson = !isClone ? clone(!Array.isArray(join) ? [join] : join) : join;
  const itemsChecker = (items) => {
    for (const item in items) {
      if (typeof items[item] === 'string') {
        for (const item2 in dataCheck)
          if (items[item].includes(`{${item2}}`))
            items[item] = items[item].replace(`{${item2}}`, dataCheck[item2]);
      } else if (objType(items[item], 'object') || Array.isArray(items[item]))
        itemsChecker(items[item], dataCheck, true);
    }
  };

  for (const index in newJson) itemsChecker(newJson[index]);
  return newJson;
};
