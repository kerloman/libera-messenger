// Libera localization — English + Russian.
// The current language is a module-level value set synchronously by the store
// before children render, so every t() call in the same render pass is correct.

export type Lang = 'en' | 'ru'
export type LangPref = 'auto' | Lang

let current: Lang = 'en'

export function systemLang(): Lang {
  const l = (typeof navigator !== 'undefined' ? navigator.language : 'en').toLowerCase()
  return l.startsWith('ru') ? 'ru' : 'en'
}

// Account choice wins (syncs across devices); then local pref; then system.
export function resolveLang(accountLang: string | null | undefined, pref: LangPref): Lang {
  if (accountLang === 'en' || accountLang === 'ru') return accountLang
  if (pref === 'en' || pref === 'ru') return pref
  return systemLang()
}

export function setLang(l: Lang) {
  current = l
  if (typeof document !== 'undefined') document.documentElement.lang = l
}

export function getLang(): Lang {
  return current
}

const en = {
  // — app shell —
  tabChats: 'Chats', tabCalls: 'Calls', tabSettings: 'Settings',
  selectConversation: 'Select a conversation',
  appTitle: 'Libera — Speak freely',

  // — auth —
  tagline: 'Speak freely.',
  emailOrUsername: 'Email or username', password: 'Password',
  signIn: 'Sign in', signingIn: 'Signing in…', forgotPassword: 'Forgot password?',
  newHere: 'new here?', createAnAccount: 'Create an account',
  email: 'Email', usernameUnique: 'Username (unique)', displayName: 'Display name',
  passwordMin8: 'Password (min 8 characters)',
  createAccount: 'Create account', creatingAccount: 'Creating account…',
  available: 'available', taken: 'taken',
  photoAfterSignup: 'You can add a profile photo in Settings after signing up.',
  haveAccount: 'I already have an account',
  forgotIntro: 'Enter your account email and we’ll send a password reset link.',
  sendResetLink: 'Send reset link', backToSignIn: 'Back to sign in',
  resetIntro: 'Choose a new password for your account.',
  newPasswordMin8: 'New password (min 8 characters)', setNewPassword: 'Set new password',
  resetSent: 'If an account exists for that email, a reset link has been sent.',
  passwordUpdated: 'Password updated — sign in with your new password.',
  authFoot: 'TLS-encrypted · your data stays on your server',

  // — chats list —
  chats: 'Chats', searchPeople: 'Search people by @username or name',
  peopleOnLibera: 'People on Libera', searching: 'Searching…',
  noUsersFoundFor: 'No users found for', noConversations: 'No conversations yet',
  emptyChatsHint: 'Search for a friend by @username above to start your first chat. Messages are private between you and them.',
  typing: 'typing…', you: 'You', online: 'online',
  newMenu: 'New',
  newChat: 'New Chat', newChatSub: 'Message a person',
  newGroup: 'New Group', newChannel: 'New Channel', newBot: 'New Bot', newStory: 'New Story',
  comingSoon: 'Coming soon', comingSoonToast: 'is coming in a future update',
  searchByUsername: 'Search by @username or name',
  searchResults: 'Search results', contacts: 'Contacts',
  noUsersFound: 'No users found.', noContactsYet: 'No contacts yet — search to find people.',
  message: 'Message', report: 'Report', sendReport: 'Send report',
  reportSentModeration: 'Report sent to the moderation team',
  reasonSpam: 'Spam', reasonAbuse: 'Abuse', reasonImpersonation: 'Impersonation', reasonOther: 'Other',

  // — chat view —
  searchInConversation: 'Search in this conversation',
  loadEarlier: 'Load earlier messages',
  beginningOfConversation: 'This is the beginning of your conversation with',
  editMessage: 'Edit message', reply: 'Reply', copyText: 'Copy text', copied: 'Copied', send: 'Send',
  edit: 'Edit', forward: 'Forward', delete: 'Delete', share: 'Share',
  messagePlaceholder: 'Message', recordingVoice: 'Recording voice message…',
  attachPhotoVideo: 'Photo / Video', attachFile: 'File', attachLocation: 'Location', attachVoice: 'Voice',
  forwardTo: 'Forward to…', noOtherConversations: 'No other conversations yet.',
  forwardedTo: 'Forwarded to',
  locationUnavailable: 'Location is not available in this browser',
  locationDenied: 'Location permission was denied',
  micDenied: 'Microphone access was denied',
  messageDeleted: 'Message deleted', attachment: 'Attachment', edited: 'edited',
  myLocation: 'My location',

  // — profile —
  profile: 'Profile', bio: 'Bio', joined: 'Joined', blocked: 'Blocked',
  addContact: 'Add contact', removeContact: 'Remove contact',
  mute: 'Mute', unmute: 'Unmute', search: 'Search',
  sharedContent: 'Shared content', noSharedMedia: 'No shared media yet',
  photos: 'Photos', videos: 'Videos', files: 'Files', voice: 'Voice', links: 'Links',
  reportUser: 'Report user', blockUser: 'Block user', unblockUser: 'Unblock user',
  clearHistory: 'Clear history', deleteChat: 'Delete chat',
  clearHistoryQ: 'Clear chat history?', deleteChatQ: 'Delete this chat?', blockQ: 'Block',
  clearHistoryWarn: 'All messages in this conversation will be permanently deleted for both of you. The chat stays in your list.',
  deleteChatWarn: 'This conversation and all its messages will be permanently deleted for both participants.',
  blockWarn: 'They won’t be able to message you or see your online status. This also removes them from your contacts.',
  block: 'Block', cancel: 'Cancel',
  addedToContacts: 'Added to contacts', removedFromContacts: 'Removed from contacts',
  unblocked: 'Unblocked', blockedToast: 'blocked',
  notificationsMuted: 'Notifications muted', notificationsOn: 'Notifications on',
  historyCleared: 'Chat history cleared', chatDeleted: 'Chat deleted',
  contactCopied: 'Contact copied to clipboard', reportSent: 'Report sent to moderators',
  verifiedAccount: 'Verified account',
  lastSeen: 'last seen', lastSeenRecently: 'last seen recently',
  lastSeenWeek: 'last seen within a week', lastSeenMonth: 'last seen within a month',
  lastSeenLong: 'last seen a long time ago',

  // — calls —
  calls: 'Calls', p2pCalls: 'Peer-to-peer calls',
  p2pCallsSub: 'Audio & video flow directly between devices (WebRTC)',
  loading: 'Loading…', noCalls: 'No calls yet',
  noCallsHint: 'Open a chat and tap the phone or camera icon to start a call.',
  missed: 'Missed', declined: 'Declined', incoming: 'Incoming', outgoing: 'Outgoing',
  video: 'video', callBack: 'Call back',
  incomingVoiceCall: 'Incoming voice call…', incomingVideoCall: 'Incoming video call…',
  calling: 'Calling', accept: 'accept', declineBtn: 'decline',
  muteBtn: 'mute', audioBtn: 'audio', cameraBtn: 'camera', flipBtn: 'flip', endBtn: 'end',
  speakerUnsupported: 'Speaker selection not supported in this browser',
  noAltOutput: 'No alternate audio output found', outputSwitchFail: 'Could not switch output',
  outputSwitched: 'Output switched',
  callDeclinedToast: 'Call declined', callEndedToast: 'Call ended',
  offlineMissedCall: 'is offline — missed call logged',
  camMicDenied: 'Camera/microphone access was denied.',
  micDeniedCall: 'Microphone access was denied.',
  oneCameraOnly: 'Only one camera available',
  voiceCallTitle: 'Voice call', videoCallTitle: 'Video call',

  // — settings —
  settings: 'Settings',
  deletionScheduled: 'Account deletion scheduled',
  daysLeftDeletes: 'permanently deletes on', keepUsing: 'You can keep using Libera until then.',
  verifyEmailBanner: 'Verify your email — we sent a link to',
  changePhoto: 'Change photo',
  appearance: 'Appearance', theme: 'Theme', themeAuto: 'Auto', themeLight: 'Light', themeDark: 'Dark',
  accentColor: 'Accent color', textSize: 'Text size', chatWallpaper: 'Chat wallpaper',
  language: 'Language', langAuto: 'Auto (system)',
  notifications: 'Notifications', messageNotifications: 'Message notifications',
  messageNotificationsSub: 'Browser notifications when Libera is in the background',
  soundsHaptics: 'Sounds & Haptics', soundsHapticsSub: 'Branded sound identity, previews, vibration',
  privacySecurity: 'Privacy & Security', privacySecuritySub: 'Last seen, online, read receipts, calls',
  changePassword: 'Change password', thisDevice: 'This device', signedIn: 'Signed in',
  end: 'End', sessionTerminated: 'Session terminated',
  data: 'Data', exportMyData: 'Export my data', exportSub: 'Profile, chats and messages as JSON',
  workspace: 'Workspace', adminPanel: 'Admin panel', signedInAs: 'Signed in as',
  accountManagement: 'Account Management', deleteAccount: 'Delete account',
  scheduledDaysLeft: 'Scheduled ·', daysLeftShort: 'days left',
  deleteNowOrSchedule: 'Delete now or schedule for later',
  logOut: 'Log out', versionLine: 'Libera · your data lives on your own server',
  profileUpdated: 'Profile updated', photoUpdated: 'Profile photo updated',
  passwordChanged: 'Password changed',
  notifBlocked: 'Notifications are blocked by the browser',
  editProfile: 'Edit profile', bioPlaceholder: 'A line about you', save: 'Save',
  currentPassword: 'Current password',
  schedule: 'Schedule', deleteNow: 'Delete now',
  deleteWarn: 'Deleting your account permanently removes your profile, private chats, messages, uploaded files and sign-in credentials. This cannot be undone.',
  deleteAfter: 'Delete automatically after',
  scheduleDeletion: 'Schedule deletion', updateScheduledDate: 'Update scheduled date',
  cancelScheduledDeletion: 'Cancel scheduled deletion',
  deletionScheduledCancelled: 'Scheduled deletion cancelled',
  deletionScheduledIn: 'Deletion scheduled in',
  confirmYourPassword: 'Confirm your password',
  permanentlyDelete: 'Permanently delete my account', deleting: 'Deleting…',
  accountDeleted: 'Account deleted',
  unknownDevice: 'Unknown device',
  month: 'month', months: 'months',

  // — privacy —
  privacyIntro: 'Control who can see your information and status. These rules are enforced on the server — hidden details are never sent to people who aren’t allowed to see them.',
  lastSeenOnline: 'Last Seen & Online', lastSeenLabel: 'Last seen', lastSeenPrecision: 'Last seen precision',
  onlineStatus: 'Online status', profilePhoto: 'Profile photo', emailAddress: 'Email address',
  callsMessaging: 'Calls & Messaging', whoCanCall: 'Who can call me',
  readReceipts: 'Read receipts', readReceiptsSub: 'If off, you won’t send or receive read receipts',
  typingIndicator: 'Typing indicator', typingIndicatorSub: 'Let others see when you’re typing',
  everyone: 'Everyone', myContacts: 'My Contacts', nobody: 'Nobody',
  showExactTime: 'Show exact time',
  privacyNote: 'Owners and administrators can still view exact status for moderation, from the admin panel only. Groups, Channels, Stories and Posts privacy will appear here when those features arrive.',

  // — sounds —
  soundsIntro: 'Libera has its own synthesized sound identity — soft, minimal tones from one tonal family. Choose Libera for the branded sound, System to defer to your device, or Silent. Tap any row’s ▶ to preview.',
  master: 'Master', volume: 'Volume',
  hapticFeedback: 'Haptic feedback', hapticSub: 'Subtle vibration on actions',
  vibration: 'Vibration', vibrationSub: 'Web/Android vibration patterns',
  soundCategories: 'Sound categories',
  catMessages: 'Messages', catMessagesSub: 'Send, receive, media, reactions',
  catCalls: 'Calls', catCallsSub: 'Ringtone, connect, end',
  catNotifications: 'Notifications', catNotificationsSub: 'Push, mentions, requests',
  catStories: 'Stories', catStoriesSub: 'Published, reactions',
  catGroups: 'Groups', catGroupsSub: 'Applies when groups arrive',
  catChannels: 'Channels', catChannelsSub: 'Applies when channels arrive',
  modeLibera: 'Libera', modeSystem: 'System', modeSilent: 'Silent',
  previewGroup: 'Preview', storiesUi: 'Stories & UI',
  restoreDefaults: 'Restore default sounds', defaultsRestored: 'Default sounds restored',
  soundNote: 'Native ringtone pickers (choosing an OS ringtone on iOS/Android) require platform plugins; the branded Libera sounds and haptics work on every platform today.',
  sMessageSent: 'Message sent', sMessageReceived: 'Message received',
  sPhotoSent: 'Photo sent', sPhotoReceived: 'Photo received',
  sFileSent: 'File sent', sFileReceived: 'File received',
  sVoiceSent: 'Voice sent', sVoiceReceived: 'Voice received',
  sReaction: 'Reaction', sEdited: 'Edited', sDeleted: 'Deleted',
  sRingIncoming: 'Incoming ringtone', sRingback: 'Ringback', sConnected: 'Connected',
  sEnded: 'Ended', sDeclined: 'Declined', sFailed: 'Failed', sMissed: 'Missed', sBusy: 'Busy',
  sPush: 'Push', sMention: 'Mention', sFriendRequest: 'Friend request', sNewContact: 'New contact',
  sAddedGroup: 'Added to group', sAddedChannel: 'Added to channel', sAdmin: 'Admin', sSecurity: 'Security',
  sStoryPublished: 'Story published', sStoryReaction: 'Story reaction', sSuccess: 'Success', sError: 'Error',

  // — admin —
  dashboard: 'Dashboard', usersNav: 'Users', reports: 'Reports', logs: 'Logs',
  exitPanel: 'Exit panel',
  registeredUsers: 'Registered users', activeUsers: 'Active users', conversations: 'Conversations',
  messagesStat: 'Messages', callsStat: 'Calls', openReports: 'Open reports',
  messagesPerDay: 'Messages per day', last7Days: 'last 7 days',
  noMessages7d: 'No messages in the last 7 days.',
  adminSearchUsers: 'Search by username or name',
  colUser: 'User', colEmail: 'Email', colLastActive: 'Last active', colRole: 'Role', colStatus: 'Status',
  onlineNow: 'Online now', offline: 'Offline',
  sessions: 'Sessions', suspend: 'Suspend', blockAdmin: 'Block', restore: 'Restore', deleteAdmin: 'Delete',
  updated: 'updated', deletedToast: 'deleted',
  deleteUserConfirm1: 'Delete account', deleteUserConfirm2: 'This cannot be undone.',
  noUsersMatch: 'No users match.',
  security: 'security', status: 'Status', exactLastSeen: 'Exact last seen',
  lastLogin: 'Last login', activeSessions: 'Active sessions',
  moderationView: 'Moderation view — not visible to normal users.',
  ipNa: 'ip n/a',
  noReports: 'No reports. 🎉', reportedBy: 'reported by',
  dismiss: 'Dismiss', markResolved: 'Mark resolved',
  resolved: 'resolved', dismissed: 'dismissed',
  noLogs: 'No log entries yet.', system: 'system',
  roleUser: 'user', roleModerator: 'moderator', roleAdmin: 'admin', roleOwner: 'owner',
  statusActive: 'active', statusBlocked: 'blocked', statusSuspended: 'suspended', statusDeleted: 'deleted',

  // — misc —
  newMessage: 'New message',
  noMessagesYet: 'No messages yet',
  photoPreview: 'Photo', videoPreview: 'Video', voicePreview: 'Voice message', filePreview: 'File',
}

type Dict = typeof en
export type TKey = keyof Dict

const ru: Dict = {
  tabChats: 'Чаты', tabCalls: 'Звонки', tabSettings: 'Настройки',
  selectConversation: 'Выберите диалог',
  appTitle: 'Libera — Говорите свободно',

  tagline: 'Говорите свободно.',
  emailOrUsername: 'Почта или имя пользователя', password: 'Пароль',
  signIn: 'Войти', signingIn: 'Вход…', forgotPassword: 'Забыли пароль?',
  newHere: 'впервые здесь?', createAnAccount: 'Создать аккаунт',
  email: 'Почта', usernameUnique: 'Имя пользователя (уникальное)', displayName: 'Отображаемое имя',
  passwordMin8: 'Пароль (минимум 8 символов)',
  createAccount: 'Создать аккаунт', creatingAccount: 'Создание аккаунта…',
  available: 'свободно', taken: 'занято',
  photoAfterSignup: 'Фото профиля можно добавить в Настройках после регистрации.',
  haveAccount: 'У меня уже есть аккаунт',
  forgotIntro: 'Укажите почту аккаунта — мы отправим ссылку для сброса пароля.',
  sendResetLink: 'Отправить ссылку', backToSignIn: 'Назад ко входу',
  resetIntro: 'Придумайте новый пароль для аккаунта.',
  newPasswordMin8: 'Новый пароль (минимум 8 символов)', setNewPassword: 'Сохранить пароль',
  resetSent: 'Если такой аккаунт существует, ссылка для сброса отправлена.',
  passwordUpdated: 'Пароль обновлён — войдите с новым паролем.',
  authFoot: 'TLS-шифрование · ваши данные остаются на вашем сервере',

  chats: 'Чаты', searchPeople: 'Поиск по @имени или имени',
  peopleOnLibera: 'Люди в Libera', searching: 'Поиск…',
  noUsersFoundFor: 'Никого не найдено по запросу', noConversations: 'Пока нет диалогов',
  emptyChatsHint: 'Найдите друга по @имени в поиске выше и начните первый чат. Сообщения видны только вам двоим.',
  typing: 'печатает…', you: 'Вы', online: 'в сети',
  newMenu: 'Создать',
  newChat: 'Новый чат', newChatSub: 'Написать человеку',
  newGroup: 'Новая группа', newChannel: 'Новый канал', newBot: 'Новый бот', newStory: 'Новая история',
  comingSoon: 'Скоро', comingSoonToast: 'появится в будущем обновлении',
  searchByUsername: 'Поиск по @имени или имени',
  searchResults: 'Результаты поиска', contacts: 'Контакты',
  noUsersFound: 'Никого не найдено.', noContactsYet: 'Контактов пока нет — найдите людей через поиск.',
  message: 'Написать', report: 'Пожаловаться', sendReport: 'Отправить жалобу',
  reportSentModeration: 'Жалоба отправлена модераторам',
  reasonSpam: 'Спам', reasonAbuse: 'Оскорбления', reasonImpersonation: 'Выдача себя за другого', reasonOther: 'Другое',

  searchInConversation: 'Поиск в этом диалоге',
  loadEarlier: 'Показать более ранние сообщения',
  beginningOfConversation: 'Это начало вашей переписки с',
  editMessage: 'Изменить сообщение', reply: 'Ответить', copyText: 'Копировать текст', copied: 'Скопировано', send: 'Отправить',
  edit: 'Изменить', forward: 'Переслать', delete: 'Удалить', share: 'Поделиться',
  messagePlaceholder: 'Сообщение', recordingVoice: 'Запись голосового сообщения…',
  attachPhotoVideo: 'Фото / Видео', attachFile: 'Файл', attachLocation: 'Геолокация', attachVoice: 'Голос',
  forwardTo: 'Переслать…', noOtherConversations: 'Других диалогов пока нет.',
  forwardedTo: 'Переслано:',
  locationUnavailable: 'Геолокация недоступна в этом браузере',
  locationDenied: 'Доступ к геолокации запрещён',
  micDenied: 'Доступ к микрофону запрещён',
  messageDeleted: 'Сообщение удалено', attachment: 'Вложение', edited: 'изменено',
  myLocation: 'Моя геолокация',

  profile: 'Профиль', bio: 'О себе', joined: 'Регистрация', blocked: 'Заблокирован',
  addContact: 'В контакты', removeContact: 'Из контактов',
  mute: 'Без звука', unmute: 'Включить звук', search: 'Поиск',
  sharedContent: 'Общие материалы', noSharedMedia: 'Пока нет общих материалов',
  photos: 'Фото', videos: 'Видео', files: 'Файлы', voice: 'Голосовые', links: 'Ссылки',
  reportUser: 'Пожаловаться', blockUser: 'Заблокировать', unblockUser: 'Разблокировать',
  clearHistory: 'Очистить историю', deleteChat: 'Удалить чат',
  clearHistoryQ: 'Очистить историю чата?', deleteChatQ: 'Удалить этот чат?', blockQ: 'Заблокировать',
  clearHistoryWarn: 'Все сообщения этого диалога будут безвозвратно удалены у вас обоих. Сам чат останется в списке.',
  deleteChatWarn: 'Этот диалог и все его сообщения будут безвозвратно удалены у обоих участников.',
  blockWarn: 'Пользователь не сможет писать вам и видеть ваш статус. Он также будет удалён из ваших контактов.',
  block: 'Заблокировать', cancel: 'Отмена',
  addedToContacts: 'Добавлено в контакты', removedFromContacts: 'Удалено из контактов',
  unblocked: 'Разблокирован', blockedToast: 'заблокирован(а)',
  notificationsMuted: 'Уведомления отключены', notificationsOn: 'Уведомления включены',
  historyCleared: 'История чата очищена', chatDeleted: 'Чат удалён',
  contactCopied: 'Контакт скопирован в буфер обмена', reportSent: 'Жалоба отправлена модераторам',
  verifiedAccount: 'Верифицированный аккаунт',
  lastSeen: 'был(а) в сети', lastSeenRecently: 'был(а) недавно',
  lastSeenWeek: 'был(а) на этой неделе', lastSeenMonth: 'был(а) в этом месяце',
  lastSeenLong: 'был(а) давно',

  calls: 'Звонки', p2pCalls: 'Звонки напрямую',
  p2pCallsSub: 'Аудио и видео передаются напрямую между устройствами (WebRTC)',
  loading: 'Загрузка…', noCalls: 'Звонков пока нет',
  noCallsHint: 'Откройте чат и нажмите значок телефона или камеры, чтобы позвонить.',
  missed: 'Пропущенный', declined: 'Отклонён', incoming: 'Входящий', outgoing: 'Исходящий',
  video: 'видео', callBack: 'Перезвонить',
  incomingVoiceCall: 'Входящий звонок…', incomingVideoCall: 'Входящий видеозвонок…',
  calling: 'Звоним', accept: 'принять', declineBtn: 'отклонить',
  muteBtn: 'микрофон', audioBtn: 'динамик', cameraBtn: 'камера', flipBtn: 'сменить', endBtn: 'завершить',
  speakerUnsupported: 'Выбор динамика не поддерживается в этом браузере',
  noAltOutput: 'Другой аудиовыход не найден', outputSwitchFail: 'Не удалось переключить вывод',
  outputSwitched: 'Вывод переключён',
  callDeclinedToast: 'Звонок отклонён', callEndedToast: 'Звонок завершён',
  offlineMissedCall: 'не в сети — звонок отмечен как пропущенный',
  camMicDenied: 'Доступ к камере/микрофону запрещён.',
  micDeniedCall: 'Доступ к микрофону запрещён.',
  oneCameraOnly: 'Доступна только одна камера',
  voiceCallTitle: 'Аудиозвонок', videoCallTitle: 'Видеозвонок',

  settings: 'Настройки',
  deletionScheduled: 'Запланировано удаление аккаунта',
  daysLeftDeletes: 'аккаунт будет удалён', keepUsing: 'До этого момента вы можете пользоваться Libera как обычно.',
  verifyEmailBanner: 'Подтвердите почту — мы отправили ссылку на',
  changePhoto: 'Сменить фото',
  appearance: 'Оформление', theme: 'Тема', themeAuto: 'Авто', themeLight: 'Светлая', themeDark: 'Тёмная',
  accentColor: 'Цвет акцента', textSize: 'Размер текста', chatWallpaper: 'Обои чата',
  language: 'Язык', langAuto: 'Авто (системный)',
  notifications: 'Уведомления', messageNotifications: 'Уведомления о сообщениях',
  messageNotificationsSub: 'Браузерные уведомления, когда Libera в фоне',
  soundsHaptics: 'Звуки и вибрация', soundsHapticsSub: 'Фирменные звуки, предпрослушивание, вибрация',
  privacySecurity: 'Конфиденциальность', privacySecuritySub: 'Был(а) в сети, статус, отчёты о прочтении, звонки',
  changePassword: 'Сменить пароль', thisDevice: 'Это устройство', signedIn: 'Вход',
  end: 'Завершить', sessionTerminated: 'Сеанс завершён',
  data: 'Данные', exportMyData: 'Экспорт моих данных', exportSub: 'Профиль, чаты и сообщения в JSON',
  workspace: 'Рабочее пространство', adminPanel: 'Панель администратора', signedInAs: 'Вы вошли как',
  accountManagement: 'Управление аккаунтом', deleteAccount: 'Удалить аккаунт',
  scheduledDaysLeft: 'Запланировано ·', daysLeftShort: 'дн. осталось',
  deleteNowOrSchedule: 'Удалить сейчас или запланировать',
  logOut: 'Выйти', versionLine: 'Libera · ваши данные живут на вашем сервере',
  profileUpdated: 'Профиль обновлён', photoUpdated: 'Фото профиля обновлено',
  passwordChanged: 'Пароль изменён',
  notifBlocked: 'Уведомления заблокированы браузером',
  editProfile: 'Изменить профиль', bioPlaceholder: 'Пара слов о себе', save: 'Сохранить',
  currentPassword: 'Текущий пароль',
  schedule: 'Запланировать', deleteNow: 'Удалить сейчас',
  deleteWarn: 'Удаление аккаунта безвозвратно стирает профиль, личные чаты, сообщения, загруженные файлы и данные входа. Это действие нельзя отменить.',
  deleteAfter: 'Удалить автоматически через',
  scheduleDeletion: 'Запланировать удаление', updateScheduledDate: 'Обновить дату удаления',
  cancelScheduledDeletion: 'Отменить запланированное удаление',
  deletionScheduledCancelled: 'Запланированное удаление отменено',
  deletionScheduledIn: 'Удаление запланировано через',
  confirmYourPassword: 'Подтвердите пароль',
  permanentlyDelete: 'Безвозвратно удалить мой аккаунт', deleting: 'Удаление…',
  accountDeleted: 'Аккаунт удалён',
  unknownDevice: 'Неизвестное устройство',
  month: 'месяц', months: 'месяцев',

  privacyIntro: 'Управляйте тем, кто видит вашу информацию и статус. Правила применяются на сервере — скрытые данные вообще не отправляются тем, кому они не разрешены.',
  lastSeenOnline: 'Был(а) в сети и онлайн', lastSeenLabel: 'Был(а) в сети', lastSeenPrecision: 'Точность «был(а) в сети»',
  onlineStatus: 'Статус «в сети»', profilePhoto: 'Фото профиля', emailAddress: 'Адрес почты',
  callsMessaging: 'Звонки и сообщения', whoCanCall: 'Кто может мне звонить',
  readReceipts: 'Отчёты о прочтении', readReceiptsSub: 'Если выключено, вы не отправляете и не получаете отчёты о прочтении',
  typingIndicator: 'Индикатор набора', typingIndicatorSub: 'Показывать другим, когда вы печатаете',
  everyone: 'Все', myContacts: 'Мои контакты', nobody: 'Никто',
  showExactTime: 'Показывать точное время',
  privacyNote: 'Владельцы и администраторы по-прежнему видят точный статус в панели администратора — только для модерации. Настройки для групп, каналов, историй и постов появятся здесь вместе с этими функциями.',

  soundsIntro: 'У Libera собственная синтезированная звуковая айдентика — мягкие минималистичные тона одной звуковой семьи. Выберите «Libera» для фирменного звука, «Система» — чтобы использовать звук устройства, или «Тихо». Нажмите ▶ в любой строке для предпрослушивания.',
  master: 'Общие', volume: 'Громкость',
  hapticFeedback: 'Тактильный отклик', hapticSub: 'Лёгкая вибрация при действиях',
  vibration: 'Вибрация', vibrationSub: 'Вибрация в Web/Android',
  soundCategories: 'Категории звуков',
  catMessages: 'Сообщения', catMessagesSub: 'Отправка, получение, медиа, реакции',
  catCalls: 'Звонки', catCallsSub: 'Рингтон, соединение, завершение',
  catNotifications: 'Уведомления', catNotificationsSub: 'Пуши, упоминания, запросы',
  catStories: 'Истории', catStoriesSub: 'Публикация, реакции',
  catGroups: 'Группы', catGroupsSub: 'Заработает с появлением групп',
  catChannels: 'Каналы', catChannelsSub: 'Заработает с появлением каналов',
  modeLibera: 'Libera', modeSystem: 'Система', modeSilent: 'Тихо',
  previewGroup: 'Прослушать', storiesUi: 'Истории и интерфейс',
  restoreDefaults: 'Восстановить стандартные звуки', defaultsRestored: 'Стандартные звуки восстановлены',
  soundNote: 'Выбор системного рингтона (iOS/Android) требует нативных плагинов; фирменные звуки Libera и вибрация работают на всех платформах уже сейчас.',
  sMessageSent: 'Сообщение отправлено', sMessageReceived: 'Сообщение получено',
  sPhotoSent: 'Фото отправлено', sPhotoReceived: 'Фото получено',
  sFileSent: 'Файл отправлен', sFileReceived: 'Файл получен',
  sVoiceSent: 'Голосовое отправлено', sVoiceReceived: 'Голосовое получено',
  sReaction: 'Реакция', sEdited: 'Изменено', sDeleted: 'Удалено',
  sRingIncoming: 'Входящий рингтон', sRingback: 'Гудки', sConnected: 'Соединение',
  sEnded: 'Завершение', sDeclined: 'Отклонён', sFailed: 'Сбой', sMissed: 'Пропущенный', sBusy: 'Занято',
  sPush: 'Пуш', sMention: 'Упоминание', sFriendRequest: 'Запрос в друзья', sNewContact: 'Новый контакт',
  sAddedGroup: 'Добавление в группу', sAddedChannel: 'Добавление в канал', sAdmin: 'Админ', sSecurity: 'Безопасность',
  sStoryPublished: 'История опубликована', sStoryReaction: 'Реакция на историю', sSuccess: 'Успех', sError: 'Ошибка',

  dashboard: 'Обзор', usersNav: 'Пользователи', reports: 'Жалобы', logs: 'Журнал',
  exitPanel: 'Выйти из панели',
  registeredUsers: 'Зарегистрировано', activeUsers: 'Активных', conversations: 'Диалогов',
  messagesStat: 'Сообщений', callsStat: 'Звонков', openReports: 'Открытых жалоб',
  messagesPerDay: 'Сообщения по дням', last7Days: 'за 7 дней',
  noMessages7d: 'За последние 7 дней сообщений не было.',
  adminSearchUsers: 'Поиск по имени пользователя или имени',
  colUser: 'Пользователь', colEmail: 'Почта', colLastActive: 'Активность', colRole: 'Роль', colStatus: 'Статус',
  onlineNow: 'Сейчас в сети', offline: 'Не в сети',
  sessions: 'Сеансы', suspend: 'Приостановить', blockAdmin: 'Заблокировать', restore: 'Восстановить', deleteAdmin: 'Удалить',
  updated: 'обновлён', deletedToast: 'удалён',
  deleteUserConfirm1: 'Удалить аккаунт', deleteUserConfirm2: 'Это действие нельзя отменить.',
  noUsersMatch: 'Никто не найден.',
  security: 'безопасность', status: 'Статус', exactLastSeen: 'Точное время визита',
  lastLogin: 'Последний вход', activeSessions: 'Активные сеансы',
  moderationView: 'Модераторский просмотр — недоступен обычным пользователям.',
  ipNa: 'ip н/д',
  noReports: 'Жалоб нет. 🎉', reportedBy: 'жалоба от',
  dismiss: 'Отклонить', markResolved: 'Решено',
  resolved: 'решено', dismissed: 'отклонено',
  noLogs: 'Записей в журнале пока нет.', system: 'система',
  roleUser: 'пользователь', roleModerator: 'модератор', roleAdmin: 'админ', roleOwner: 'владелец',
  statusActive: 'активен', statusBlocked: 'заблокирован', statusSuspended: 'приостановлен', statusDeleted: 'удалён',

  newMessage: 'Новое сообщение',
  noMessagesYet: 'Сообщений пока нет',
  photoPreview: 'Фото', videoPreview: 'Видео', voicePreview: 'Голосовое сообщение', filePreview: 'Файл',
}

const dicts: Record<Lang, Dict> = { en, ru }

export function t(key: TKey): string {
  return dicts[current][key] ?? en[key] ?? key
}

// Russian plural helper: plural(5, 'день', 'дня', 'дней')
export function plural(n: number, one: string, few: string, many: string): string {
  if (current === 'en') return n === 1 ? one : few
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

export function tDays(n: number): string {
  return current === 'ru'
    ? `${n} ${plural(n, 'день', 'дня', 'дней')}`
    : `${n} day${n === 1 ? '' : 's'}`
}

export function tMonths(n: number): string {
  return current === 'ru'
    ? `${n} ${plural(n, 'месяц', 'месяца', 'месяцев')}`
    : `${n} month${n === 1 ? '' : 's'}`
}

export function tMatches(n: number): string {
  return current === 'ru'
    ? `${n} ${plural(n, 'совпадение', 'совпадения', 'совпадений')}`
    : `${n} match${n === 1 ? '' : 'es'}`
}

// The server replies with human-readable English messages; this maps the known
// set so errors localize too. Unknown messages pass through unchanged.
const serverErrors: Record<string, string> = {
  'Not signed in.': 'Вы не вошли в аккаунт.',
  'Enter a valid email address.': 'Введите корректный адрес почты.',
  'Password must be at least 8 characters.': 'Пароль должен содержать минимум 8 символов.',
  'Username must be 3–20 characters: letters, numbers, underscore.': 'Имя пользователя: 3–20 символов — буквы, цифры, подчёркивание.',
  'Display name is required (max 50 characters).': 'Укажите отображаемое имя (до 50 символов).',
  'An account with this email already exists.': 'Аккаунт с этой почтой уже существует.',
  'This username is taken.': 'Это имя пользователя занято.',
  'Enter your email/username and password.': 'Введите почту/имя пользователя и пароль.',
  'Incorrect email/username or password.': 'Неверная почта/имя пользователя или пароль.',
  'This account has been blocked.': 'Этот аккаунт заблокирован.',
  'This account is suspended.': 'Этот аккаунт приостановлен.',
  'This verification link is invalid or has expired.': 'Ссылка подтверждения недействительна или истекла.',
  'This reset link is invalid or has expired.': 'Ссылка сброса недействительна или истекла.',
  'Too many attempts. Try again in a minute.': 'Слишком много попыток. Повторите через минуту.',
  'Slow down a little.': 'Чуть помедленнее.',
  'Display name must be 1–50 characters.': 'Отображаемое имя: 1–50 символов.',
  'Choose an image file.': 'Выберите файл изображения.',
  'Avatar must be an image up to 5 MB.': 'Аватар — изображение до 5 МБ.',
  'Current password is incorrect.': 'Текущий пароль неверен.',
  'New password must be at least 8 characters.': 'Новый пароль должен содержать минимум 8 символов.',
  'User not found.': 'Пользователь не найден.',
  'You cannot message yourself.': 'Нельзя написать самому себе.',
  'You cannot add yourself.': 'Нельзя добавить самого себя.',
  'You cannot block yourself.': 'Нельзя заблокировать самого себя.',
  'You cannot start a chat with this user.': 'Нельзя начать чат с этим пользователем.',
  'You can’t message this user.': 'Вы не можете писать этому пользователю.',
  'You are not a member of this conversation.': 'Вы не участник этого диалога.',
  'Message is empty.': 'Сообщение пустое.',
  'Reply target not found.': 'Сообщение для ответа не найдено.',
  'Message not found.': 'Сообщение не найдено.',
  'Not allowed.': 'Недостаточно прав.',
  'You can only edit your own messages.': 'Можно изменять только свои сообщения.',
  'Only text messages can be edited.': 'Изменять можно только текстовые сообщения.',
  'You can only delete your own messages.': 'Можно удалять только свои сообщения.',
  'Missing emoji.': 'Не указана реакция.',
  'You are not a member of the target conversation.': 'Вы не участник целевого диалога.',
  'Choose a reason.': 'Выберите причину.',
  'File is too large (max 25 MB).': 'Файл слишком большой (макс. 25 МБ).',
  'Choose 1, 3, 6, 12, 18 or 24 months.': 'Выберите 1, 3, 6, 12, 18 или 24 месяца.',
  'Password is incorrect.': 'Неверный пароль.',
  'Transfer ownership to another owner before deleting the last owner account.': 'Передайте права владельца, прежде чем удалять последний аккаунт владельца.',
  'You cannot manage a user with an equal or higher role.': 'Нельзя управлять пользователем с равной или более высокой ролью.',
  'Invalid status.': 'Недопустимый статус.',
  'You cannot change your own status.': 'Нельзя изменить собственный статус.',
  'Invalid role.': 'Недопустимая роль.',
  'Only admins can change roles.': 'Роли могут менять только администраторы.',
  'You cannot change your own role.': 'Нельзя изменить собственную роль.',
  'You cannot grant a role equal to or higher than your own.': 'Нельзя выдать роль, равную своей или выше.',
  'You cannot delete your own account here.': 'Здесь нельзя удалить собственный аккаунт.',
  'You cannot delete a user with an equal or higher role.': 'Нельзя удалить пользователя с равной или более высокой ролью.',
  'Server unavailable. Is the backend running?': 'Сервер недоступен. Запущен ли бэкенд?',
  'Something went wrong.': 'Что-то пошло не так.',
  // coarse last-seen labels sent by the server
  'last seen recently': 'был(а) недавно',
  'last seen within a week': 'был(а) на этой неделе',
  'last seen within a month': 'был(а) в этом месяце',
  'last seen a long time ago': 'был(а) давно',
}

export function translateServer(msg: string): string {
  if (current === 'en') return msg
  return serverErrors[msg] ?? msg
}
