import { getAppearance } from '../../appearance';

class TimelineCachePagination {
  // Build Pagination
  buildPagination(roomId, threadId, config = {}) {
    if (this.get(roomId, threadId)) {
      // Get config
      const page = config.page;
      const eventId = config.eventId;
      const limit = config.limit;

      // Config Json
      const getMsgConfig = {
        roomId: roomId,
        showRedaction: false,
      };

      // Limit
      if (typeof limit === 'number') {
        if (!Number.isNaN(limit) && Number.isFinite(limit) && limit > 0) getMsgConfig.limit = limit;
      } else getMsgConfig.limit = getAppearance('pageLimit');

      // Page Number
      if (typeof page === 'number') getMsgConfig.page = page;

      // No thread value
      if (!threadId) getMsgConfig.showThreads = false;
      if (typeof eventId === 'string' || Array.isArray(eventId)) getMsgConfig.eventId = eventId;
      else getMsgConfig.threadId = threadId;

      // Complete
      return getMsgConfig;
    } else return null;
  }
}

export default TimelineCachePagination;
