import { openDB } from 'idb';

const DB_NAME = '2catDB';
const DB_VERSION = 5; // Increment DB version to trigger upgrade for schema changes
const OBJECT_STORE_NAME = 'posts';

export async function initDB() {
    const db = await openDB(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion) {
            if (oldVersion < 3) {
                if (db.objectStoreNames.contains('videos')) {
                    db.deleteObjectStore('videos');
                }
                const store = db.createObjectStore(OBJECT_STORE_NAME, {
                    keyPath: 'id',
                    autoIncrement: true,
                });
                store.createIndex('boardName', 'boardName', { unique: false });
            }
            if (oldVersion < 4) { // Upgrade logic for version 4: add username field
                // This block was already handled in a previous iteration.
                // Recreating the store to add 'username' potentially caused data loss before.
                // For 'parentId', we will just ensure the store exists correctly for version 5.
                if (db.objectStoreNames.contains(OBJECT_STORE_NAME)) {
                    db.deleteObjectStore(OBJECT_STORE_NAME);
                }
                const store = db.createObjectStore(OBJECT_STORE_NAME, {
                    keyPath: 'id',
                    autoIncrement: true,
                });
                store.createIndex('boardName', 'boardName', { unique: false });
            }
            if (oldVersion < 5) { // New upgrade logic for version 5: add parentId field
                // No need to delete/recreate if we just want to ensure future posts have it.
                // Existing posts will get a 'parentId: undefined' which is fine.
                // If a full migration of existing data to include 'parentId: null' was needed,
                // we'd iterate over existing objects and use put(), but for new field add,
                // simply ensuring the store structure for new posts is enough.
                if (!db.objectStoreNames.contains(OBJECT_STORE_NAME)) {
                     const store = db.createObjectStore(OBJECT_STORE_NAME, {
                        keyPath: 'id',
                        autoIncrement: true,
                    });
                    store.createIndex('boardName', 'boardName', { unique: false });
                }
                // No new index specifically for parentId as we fetch all by boardName
                // and then organize the hierarchy in script.js.
            }
        },
    });
    return db;
}

export async function addPost(db, file, comment, linkUrl, boardName, username, parentId = null) { // Added parentId parameter
    const timestamp = Date.now();
    const transaction = db.transaction(OBJECT_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(OBJECT_STORE_NAME);

    let fileType = null;
    let fileBlob = null;
    if (file) {
        fileBlob = file;
        if (file.type.startsWith('video/')) {
            fileType = 'video';
        } else if (file.type.startsWith('image/')) {
            fileType = 'image';
        }
    }

    let linkStatus = null;
    if (linkUrl) {
        linkStatus = 'pending';
    }

    const postData = {
        file: fileBlob,
        fileType,
        comment,
        timestamp,
        boardName,
        linkUrl,
        linkStatus,
        linkReason: null,
        username: username || 'Anonymous', // Store username, default to 'Anonymous' if empty
        parentId: parentId // Store parentId, null for top-level posts
    };

    const id = await store.add(postData);
    await transaction.done;
    return { id, ...postData }; // Return the full post data with ID
}

export async function loadPosts(db, boardName) {
    const transaction = db.transaction(OBJECT_STORE_NAME, 'readonly');
    const store = transaction.objectStore(OBJECT_STORE_NAME);
    const index = store.index('boardName');
    const posts = await index.getAll(IDBKeyRange.only(boardName));
    await transaction.done;
    return posts.sort((a, b) => b.timestamp - a.timestamp); // Sort here for consistency
}

export async function deletePost(db, id) {
    const transaction = db.transaction(OBJECT_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(OBJECT_STORE_NAME);
    const postToDelete = await store.get(id); // Get post data to revoke object URL
    await store.delete(id);
    await transaction.done;
    return postToDelete; // Return the deleted post data
}

export async function getPost(db, id) {
    const transaction = db.transaction(OBJECT_STORE_NAME, 'readonly');
    const store = transaction.objectStore(OBJECT_STORE_NAME);
    const post = await store.get(id);
    await transaction.done;
    return post;
}

export async function updatePost(db, post) {
    const transaction = db.transaction(OBJECT_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(OBJECT_STORE_NAME);
    await store.put(post);
    await transaction.done;
}