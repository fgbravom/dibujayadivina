// Punto de entrada de la capa de pantallas (T4). Presentación pura: sin sockets ni store.

export { HomeScreen, type HomeScreenProps } from './screens/HomeScreen';
export { LobbyScreen, type LobbyScreenProps } from './screens/LobbyScreen';
export { GameScreen, type GameScreenProps } from './screens/GameScreen';
export { GameEndScreen, type GameEndScreenProps } from './screens/GameEndScreen';
export { ReconnectBanner } from './components/ReconnectBanner';

export type { FeedItem, SystemTone, ComposerMode } from './types';

export { useCountdown, type Countdown } from './hooks/useCountdown';
export { computeServerOffset, secondsRemaining, formatClock } from './lib/clock';
export { errorMessage } from './lib/errors';
export {
  messageToFeedItem,
  guessedFeedItem,
  closeFeedItem,
  joinedFeedItem,
  leftFeedItem,
  infoFeedItem,
  trimFeed,
  MAX_FEED_ITEMS,
} from './lib/feed';
export { roomShareUrl, roomSharePath } from './lib/share';
