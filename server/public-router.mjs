import { makeCreatorPageHandler } from './creator-page.mjs';
import { makeProjectIndexHandler } from './project-index.mjs';
import { makeThreadPageHandler, threadSlugFromPath } from './thread-page.mjs';
import { makeLaunchQueueHandler, makeBadgeCheckHandler } from './launch-queue.mjs';
import {makeNewsHandler} from './news-handler.mjs';
import { makeMembershipCheckoutHandler } from './membership-checkout.mjs';
import { makePublicHandler } from './public-community.mjs';
import { makeSavedItemHandler } from './saved-items.mjs';
import { makeProjectViewHandler } from './project-views.mjs';
import { makeResourceViewHandler } from './resource-views.mjs';
import { makeCardInteractionHandler } from './card-interactions.mjs';
import { makeLinkVoteHandler } from './link-votes.mjs';
import { makeFeedbackPointsHandler } from './feedback-points.mjs';
import { makeDiscussionHandler } from './discussions.mjs';
import { makeThreadsHandler } from './threads.mjs';
import { makeLaunchesHandler } from './launches.mjs';
import { makeMakerStatsHandler } from './maker-stats.mjs';
import { makeCarouselHandler, makeCarouselPublishHandler } from './carousels.mjs';
import { makeFoundingAccessHandler, makeFoundingLogoutHandler } from './founding-access.mjs';
import { makeProjectAccountHandler } from './project-account.mjs';
import { makeCreatorProfileHandler } from './creator-profile.mjs';
import { makeCreatorInboxHandler } from './creator-inbox.mjs';
import { makeNotificationsHandler } from './notifications-handler.mjs';
import { makeReturnEmailHandler } from './return-emails.mjs';
import { makeSiteActivityHandler } from './site-activity.mjs';
import { makeMemberStatusHandler } from './member-status.mjs';
import { makeBadgeHandler } from './badge.mjs';

// Share one deployment entry point; each handler retains its validation and response.
// Carousel routes stay on this router so the deployment does not add a serverless function.
export function defaultPublicHandlers(overrides = {}) {
  return {
    'launch-queue':makeLaunchQueueHandler(),
    'badge-check':makeBadgeCheckHandler(),
    news:makeNewsHandler(),
    'site-activity': makeSiteActivityHandler(),
    'invstr-activity': makeSiteActivityHandler({}, 'invstr'),
    'membership-checkout': makeMembershipCheckoutHandler(),
    'member-status': makeMemberStatusHandler(),
    content: makePublicHandler('content'),
    'saved-item': makeSavedItemHandler(),
    'project-views': makeProjectViewHandler(),
    'resource-views': makeResourceViewHandler(),
    'card-interactions': makeCardInteractionHandler(),
    'link-votes': makeLinkVoteHandler(),
    'feedback-points': makeFeedbackPointsHandler(),
    discussions: makeDiscussionHandler(),
    launches: makeLaunchesHandler(),
    'maker-stats': makeMakerStatsHandler(),
    threads: makeThreadsHandler(),
    carousels: makeCarouselHandler(),
    'carousel-publish': makeCarouselPublishHandler(),
    'founding-access': makeFoundingAccessHandler(),
    'founding-logout': makeFoundingLogoutHandler(),
    'project-account': makeProjectAccountHandler(),
    'creator-profile': makeCreatorProfileHandler(),
    'creator-page': makeCreatorPageHandler(),
    'project-index': makeProjectIndexHandler(),
    'thread-page': makeThreadPageHandler(),
    'creator-inbox': makeCreatorInboxHandler(),
    notifications: makeNotificationsHandler(),
    'return-emails': makeReturnEmailHandler(),
    badge: makeBadgeHandler(),
    ...overrides,
  };
}
export function makePublicRouter(handlers = defaultPublicHandlers()) {
  return (req, res) => {
    const path = new URL(req.url, 'https://digivated.invalid').pathname;
    const retiredPage = path.replace(/\/$/, '');
    if (retiredPage === '/creators' || retiredPage === '/inbox') {
      res.statusCode = 308;
      res.setHeader('Location', retiredPage === '/creators' ? '/threads' : '/dashboard');
      return res.end();
    }
    // Vercel preserves the original URL for rewritten requests.
    const route = /^\/creator\/?$/.test(path) ? 'creator-page' : /^\/projects\/?$/.test(path) ? 'project-index' : threadSlugFromPath(path) ? 'thread-page' : /^\/badge\/[^/]+\/?$/.test(path) ? 'badge' : /^\/api\/([^/]+)$/.exec(path)?.[1];
    if (route && Object.hasOwn(handlers, route)) return handlers[route](req, res);
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ error: 'Not found.' }));
  };
}
