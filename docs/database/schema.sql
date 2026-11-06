-- Third Wheel database schema (SQLite). Generated from the running server; the server creates and migrates these tables itself on start.

CREATE TABLE activity(userId INTEGER, hour INTEGER, n INTEGER DEFAULT 0, PRIMARY KEY(userId, hour));

CREATE TABLE audit(id INTEGER PRIMARY KEY, adminId INTEGER, action TEXT, target TEXT, at TEXT);

CREATE TABLE avatars(userId INTEGER PRIMARY KEY, mime TEXT NOT NULL, data BLOB NOT NULL);

CREATE TABLE ban_appeals(id INTEGER PRIMARY KEY, userId INTEGER, username TEXT, reason TEXT, message TEXT, status TEXT DEFAULT 'pending', createdAt TEXT, reviewedAt TEXT, reviewedBy INTEGER);

CREATE TABLE banned_devices(deviceId TEXT PRIMARY KEY, reason TEXT, bannedAt TEXT, bannedBy INTEGER);

CREATE TABLE banned_ips(ip TEXT PRIMARY KEY, reason TEXT, bannedAt TEXT, bannedBy INTEGER);

CREATE TABLE banners(userId INTEGER PRIMARY KEY, mime TEXT NOT NULL, data BLOB NOT NULL);

CREATE TABLE dms(id INTEGER PRIMARY KEY, a INTEGER, b INTEGER, fromId INTEGER, text TEXT, createdAt TEXT, replyTo INTEGER, editedAt TEXT, deletedAt TEXT, fileId INTEGER, pinnedAt TEXT, updatedAt TEXT);

CREATE TABLE email_tokens(hash TEXT PRIMARY KEY, userId INTEGER NOT NULL, email TEXT, purpose TEXT NOT NULL, exp TEXT NOT NULL);

CREATE TABLE files(id INTEGER PRIMARY KEY, ownerId INTEGER, name TEXT, mime TEXT, size INTEGER, kind TEXT, path TEXT, convKind TEXT, convKey TEXT, msgId INTEGER, createdAt TEXT, deletedAt TEXT, conv TEXT, trimStart REAL, trimEnd REAL);

CREATE TABLE frequests(id INTEGER PRIMARY KEY, fromId INTEGER, toId INTEGER, UNIQUE(fromId,toId));

CREATE TABLE friends(a INTEGER, b INTEGER, PRIMARY KEY(a,b));

CREATE TABLE games(
            id INTEGER PRIMARY KEY,
            steamAppId INTEGER,
            name TEXT NOT NULL UNIQUE COLLATE NOCASE,
            cover BLOB,
            coverMime TEXT,
            created TEXT
        , hidden INTEGER DEFAULT 0, verified INTEGER DEFAULT 0);

CREATE TABLE group_bans(groupId INTEGER, userId INTEGER, byId INTEGER, reason TEXT, at TEXT, PRIMARY KEY(groupId,userId));

CREATE TABLE group_icons(groupId INTEGER PRIMARY KEY, mime TEXT NOT NULL, data BLOB NOT NULL);

CREATE TABLE group_mutes(groupId INTEGER, userId INTEGER, until TEXT, byId INTEGER, at TEXT, PRIMARY KEY(groupId,userId));

CREATE TABLE grps(id INTEGER PRIMARY KEY, name TEXT, game TEXT, mode TEXT, region TEXT, ageMin INTEGER, ageMax INTEGER, description TEXT, color TEXT, ownerId INTEGER, created TEXT, privacy TEXT DEFAULT 'public', iconVer INTEGER DEFAULT 0, rules TEXT DEFAULT '', maxMembers INTEGER DEFAULT 0, slowmode INTEGER DEFAULT 0, joinCode TEXT);

CREATE TABLE invites(id INTEGER PRIMARY KEY, groupId INTEGER, fromId INTEGER, toId INTEGER, UNIQUE(groupId,toId));

CREATE TABLE join_requests(id INTEGER PRIMARY KEY, groupId INTEGER, userId INTEGER, at TEXT, UNIQUE(groupId,userId));

CREATE TABLE lfg_posts(id INTEGER PRIMARY KEY, userId INTEGER, game TEXT, mode TEXT, region TEXT, slots INTEGER, note TEXT, mic INTEGER DEFAULT 0,
            groupId INTEGER, createdAt TEXT, expiresAt TEXT, closed INTEGER DEFAULT 0);

CREATE TABLE lfg_responses(postId INTEGER, userId INTEGER, at TEXT, PRIMARY KEY(postId, userId));

CREATE TABLE members(groupId INTEGER, userId INTEGER, role TEXT DEFAULT 'member', PRIMARY KEY(groupId,userId));

CREATE TABLE messages(id INTEGER PRIMARY KEY, groupId INTEGER, userId INTEGER, text TEXT, createdAt TEXT, replyTo INTEGER, editedAt TEXT, deletedAt TEXT, fileId INTEGER, pinnedAt TEXT, updatedAt TEXT);

CREATE TABLE notifications(id INTEGER PRIMARY KEY, userId INTEGER, type TEXT, fromId INTEGER, groupId INTEGER, peerId INTEGER, refId INTEGER, snippet TEXT, createdAt TEXT, readAt TEXT);

CREATE TABLE notify_init(userId INTEGER PRIMARY KEY);

CREATE TABLE oauth_accounts(provider TEXT NOT NULL, extId TEXT NOT NULL, userId INTEGER NOT NULL, email TEXT, createdAt TEXT, PRIMARY KEY(provider, extId));

CREATE TABLE play_sessions(id INTEGER PRIMARY KEY, kind TEXT, game TEXT, groupId INTEGER, startedAt TEXT, endedAt TEXT);

CREATE TABLE profile_clips(id INTEGER PRIMARY KEY, userId INTEGER NOT NULL, fileId INTEGER NOT NULL UNIQUE, title TEXT, createdAt TEXT);

CREATE TABLE profile_extras(userId INTEGER PRIMARY KEY, bio TEXT, playMode TEXT, tags TEXT DEFAULT '[]', langs TEXT DEFAULT '[]', tz INTEGER DEFAULT 0, avail TEXT, updated TEXT);

CREATE TABLE push_keys(id INTEGER PRIMARY KEY CHECK(id=1), pub TEXT, priv TEXT);

CREATE TABLE push_subs(id INTEGER PRIMARY KEY, userId INTEGER, endpoint TEXT UNIQUE, p256dh TEXT, auth TEXT, createdAt TEXT);

CREATE TABLE reactions(kind TEXT NOT NULL, msgId INTEGER NOT NULL, userId INTEGER NOT NULL, emoji TEXT NOT NULL, PRIMARY KEY(kind,msgId,userId,emoji));

CREATE TABLE reads(userId INTEGER, kind TEXT, key INTEGER, lastId INTEGER, PRIMARY KEY(userId,kind,key));

CREATE TABLE session_players(sessionId INTEGER, userId INTEGER, PRIMARY KEY(sessionId, userId));

CREATE TABLE session_ratings(sessionId INTEGER, fromId INTEGER, toId INTEGER, good INTEGER, at TEXT, PRIMARY KEY(sessionId, fromId, toId));

CREATE TABLE sessions(tokenHash TEXT PRIMARY KEY, userId INTEGER, created TEXT);

CREATE TABLE site(key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE user_blocks(userId INTEGER, blockedId INTEGER, at TEXT, PRIMARY KEY(userId, blockedId));

CREATE TABLE user_games(userId INTEGER, game TEXT, rank TEXT, role TEXT, hours INTEGER, PRIMARY KEY(userId, game));

CREATE TABLE user_prefs(userId INTEGER PRIMARY KEY, accentColor TEXT DEFAULT '#7c8cff', fontScale REAL DEFAULT 1.0, language TEXT DEFAULT 'en', nsfwFilter INTEGER DEFAULT 1, profanityFilter INTEGER DEFAULT 1, disablePfpAnimation INTEGER DEFAULT 0, favGifs TEXT DEFAULT '[]', gamerTags TEXT DEFAULT '{}');

CREATE TABLE user_reports(id INTEGER PRIMARY KEY, reporterId INTEGER, reportedUserId INTEGER, messageId INTEGER, groupId INTEGER, reason TEXT, details TEXT, status TEXT DEFAULT 'pending', at TEXT, messageKind TEXT, snippet TEXT, resolution TEXT, resolvedBy INTEGER, resolvedAt TEXT);

CREATE TABLE users(id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, hash TEXT, salt TEXT, color TEXT, region TEXT, age INTEGER DEFAULT 0, games TEXT DEFAULT '[]', onboarded INTEGER DEFAULT 0, status TEXT DEFAULT 'offline', playing TEXT, created TEXT, display TEXT, avatarVer INTEGER DEFAULT 0, bannerVer INTEGER DEFAULT 0, isAdmin INTEGER DEFAULT 0, banned INTEGER DEFAULT 0, banReason TEXT, birthDate TEXT, lastIp TEXT, deviceId TEXT, suspendedUntil TEXT, tosAccepted INTEGER DEFAULT 0, rcktUntil TEXT, hideReceipts INTEGER DEFAULT 0, frame TEXT, effect TEXT, layout TEXT, oauthOnly INTEGER DEFAULT 0, email TEXT, emailVerified INTEGER DEFAULT 0, pendingEmail TEXT);

CREATE TABLE verified_tags(userId INTEGER NOT NULL, platform TEXT NOT NULL, handle TEXT NOT NULL, extId TEXT NOT NULL, at TEXT, PRIMARY KEY(userId, platform));

CREATE INDEX ix_dms ON dms(a,b,id);

CREATE INDEX ix_email_tokens_user ON email_tokens(userId, purpose);

CREATE INDEX ix_games_name ON games(name COLLATE NOCASE);

CREATE INDEX ix_games_steamAppId ON games(steamAppId);

CREATE UNIQUE INDEX ix_grp_code ON grps(joinCode);

CREATE INDEX ix_lfg_open ON lfg_posts(closed, expiresAt);

CREATE INDEX ix_msg ON messages(groupId,id);

CREATE INDEX ix_notif_user ON notifications(userId, readAt, id);

CREATE INDEX ix_oauth_user ON oauth_accounts(userId);

CREATE INDEX ix_profile_clips_user ON profile_clips(userId, id DESC);

CREATE INDEX ix_push_user ON push_subs(userId);

CREATE INDEX ix_sp_user ON session_players(userId, sessionId);

CREATE INDEX ix_sr_to ON session_ratings(toId, good);

CREATE UNIQUE INDEX ux_users_verified_email ON users(lower(email)) WHERE emailVerified=1;

CREATE UNIQUE INDEX ux_verified_ext ON verified_tags(platform, extId);
