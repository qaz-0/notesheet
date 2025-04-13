import type { Item } from "./types";

const DB_NAME = "notesheet-db";

export function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME);

        request.onupgradeneeded = () => {
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function createTable(tableName: string) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        if (db.objectStoreNames.contains(tableName)) {
            reject(new Error(`Table ${tableName} already exists`));
        } else {
            db.close();
            const version = db.version + 1;
            const upgradeReq = indexedDB.open(DB_NAME, version);
            upgradeReq.onupgradeneeded = () => {
                upgradeReq.result.createObjectStore(tableName, { keyPath: "id" })
                    .createIndex("idIndex", "id", { unique: true });;
            };
            upgradeReq.onsuccess = () => resolve(upgradeReq.result);
            upgradeReq.onerror = () => reject(upgradeReq.error);
        }
    });
}

export async function getTable(tableName: string) {
    const db = await openDB();
    return new Promise<{ data: Item[]; keys: string[] }>((resolve, reject) => {
        const tx = db.transaction(tableName, "readonly");
        const store = tx.objectStore(tableName);

        // index is sorted automatically
        const index = store.index("idIndex");
        const req = index.openCursor(null, "prev");
        const data: Item[] = [];
        const keys: Set<string> = new Set();

        req.onsuccess = () => {
            const cur = req.result;
            if (cur) {
                data.push(cur.value);
                Object.keys(cur.value).forEach(key => keys.add(key));

                cur.continue();
            } else {
                resolve({ data, keys: Array.from(keys) });
            }
        };
        req.onerror = () => reject(req.error);
    });
}


// export async function addItem(tableName: string, item: Item) {
//     const db = await openDB(tableName);
//     return new Promise<Item>((resolve, reject) => {
//         const tx = db.transaction(tableName, "readwrite");
//         const store = tx.objectStore(tableName);
//         const req = store.put(item);

//         req.onsuccess = () => {
//             item.id = req.result;
//             resolve(item);
//         };
//         req.onerror = () => reject(req.error);
//     });
// }

export async function deleteItem(tableName: string, id: IDBValidKey) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(tableName, "readwrite");
        const store = tx.objectStore(tableName);
        store.delete(id);

        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
    });
}

export async function getItemById(tableName: string, id: IDBValidKey) {
    const db = await openDB();
    return new Promise<Item | null>((resolve, reject) => {
        const tx = db.transaction(tableName, "readonly");
        const store = tx.objectStore(tableName);
        const index = store.index("idIndex");
        const req = index.get(id);

        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export async function editItem(tableName: string, newItem: Item) {
    const db = await openDB();
    return new Promise<Item>((resolve, reject) => {
        const tx = db.transaction(tableName, "readwrite");
        const store = tx.objectStore(tableName);
        const index = store.index("idIndex");
        const req = index.get(newItem.id);

        req.onsuccess = () => {
            const existingItem = req.result;
            if (existingItem) {
                Object.assign(existingItem, newItem);
                const updateReq = store.put(existingItem);
                updateReq.onsuccess = () => resolve(existingItem);
                updateReq.onerror = () => reject(updateReq.error);
            } else {
                const req = store.put(newItem);
                req.onsuccess = () => resolve(newItem);
                req.onerror = () => reject(req.error);
            }
        };

        req.onerror = () => reject(req.error);
    });
}

// export async function saveTable(tableName: string, todos: any[]) {
//     const db = await openDB(tableName);
//     const tx = db.transaction(tableName, 'readwrite');
//     const store = tx.objectStore(tableName);
//     store.clear(); // optional: clear all before saving
//     for (const todo of todos) {
//         store.put(todo);
//     }
// }

export async function deleteTable(tableName: string) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        db.close();
        const version = db.version + 1;
        const upgradeReq = indexedDB.open(DB_NAME, version);
        upgradeReq.onupgradeneeded = () => {
            upgradeReq.result.deleteObjectStore(tableName);
        };
        upgradeReq.onsuccess = () => resolve(upgradeReq.result);
        upgradeReq.onerror = () => reject(upgradeReq.error);
    });
}

export async function getKeys(tableName: string) {
    const db = await openDB();
    return new Promise<string[]>((resolve, reject) => {
        const tx = db.transaction(tableName, "readonly");
        const store = tx.objectStore(tableName);
        const req = store.getAllKeys();

        req.onsuccess = () => {
            if (req.result.length > 0) {
                resolve(req.result as string[]);
            } else {
                resolve([]);
            }
        };
        req.onerror = () => reject(req.error);
    });
}


export async function getTableNames() {
    const db = await openDB();
    return new Promise<string[]>((resolve, reject) => {
        const names = Array.from(db.objectStoreNames);
        resolve(names as string[]);
    });
}