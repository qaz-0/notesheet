import type { Item, Table } from "./types";

const DB_NAME = "notesheet-db";
const METADATA_STORE_NAME = "tables-metadata";

export function resetDB(): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(DB_NAME);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

export function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME);

        request.onupgradeneeded = (event) => {
            // create metadata store on init
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(METADATA_STORE_NAME)) {
                db.createObjectStore(METADATA_STORE_NAME, { keyPath: "id", autoIncrement: true });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function createTable(table: Table) {
    const tableId = await setTableMetadata(table);
    const db = await openDB();
    return new Promise<Table>((resolve, reject) => {
        if (db.objectStoreNames.contains(tableId.toString())) {
            db.close();
            reject(new Error(`Table ${table.id} already exists`));
        } else {
            db.close();
            const version = db.version + 1;
            const upgradeReq = indexedDB.open(DB_NAME, version);
            table.id = tableId;
            upgradeReq.onupgradeneeded = (event) => {
                // create new table
                const upgradeDb = (event.target as IDBOpenDBRequest).result;
                upgradeDb.createObjectStore(tableId.toString(), { keyPath: "id" })
                    .createIndex("idIndex", "id", { unique: true });
            };

            upgradeReq.onsuccess = () => resolve(table);
            upgradeReq.onerror = () => reject(upgradeReq.error);
        }
    });
}

export async function deleteTable(tableId: IDBValidKey) {
    let tableStoreName = tableId.toString()
    const db = await openDB();
    return new Promise<IDBDatabase>((resolve, reject) => {
        db.close();
        const version = db.version + 1;
        const upgradeReq = indexedDB.open(DB_NAME, version);
        upgradeReq.onupgradeneeded = (event) => {
            const upgradeDb = (event.target as IDBOpenDBRequest).result;
            if (upgradeDb.objectStoreNames.contains(tableStoreName)) {
                upgradeDb.deleteObjectStore(tableStoreName);
            }
        };
        upgradeReq.onsuccess = async () => {
            const newDb = upgradeReq.result;
            await deleteTableMetadata(tableId);
            resolve(newDb);
        };
        upgradeReq.onerror = () => reject(upgradeReq.error);
    });
}

export async function getTable(tableId: IDBValidKey) {
    let tableStoreName = tableId.toString()
    const fields = (await getTableMetadata(tableId)).fields;
    console.log(fields)
    const db = await openDB();
    return new Promise<Item[]>((resolve, reject) => {
        const tx = db.transaction(tableStoreName, "readonly");
        const store = tx.objectStore(tableStoreName);
        const index = store.index("idIndex");
        const req = index.openCursor(null, "prev");
        const data: Item[] = [];

        req.onsuccess = () => {
            const cur = req.result;
            if (cur) {
                const item = cur.value;
                data.push(item);
                cur.continue();
            } else {
                resolve(data);
            }
        };
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
        tx.onerror = () => reject(tx.error);
    });
}

export async function deleteItem(tableId: IDBValidKey, id: IDBValidKey) {
    let tableStoreName = tableId.toString()
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(tableStoreName, "readwrite");
        const store = tx.objectStore(tableStoreName);
        store.delete(id);

        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
    });
}

export async function getItemById(tableId: IDBValidKey, id: IDBValidKey) {
    let tableStoreName = tableId.toString()
    const db = await openDB();
    return new Promise<Item | null>((resolve, reject) => {
        const tx = db.transaction(tableStoreName, "readonly");
        const store = tx.objectStore(tableStoreName);
        const index = store.index("idIndex");
        const req = index.get(id);

        req.onsuccess = () => {
            const item = req.result as Item;
            resolve(item);
        };
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
        tx.onerror = () => reject(tx.error);
    });
}

export async function editItem(tableId: IDBValidKey, modifyItem: Item) {
    let tableStoreName = tableId.toString()
    const db = await openDB();
    return new Promise<Item | null>((resolve, reject) => {
        const tx = db.transaction(tableStoreName, "readwrite");
        const store = tx.objectStore(tableStoreName);
        const index = store.index("idIndex");
        const req = index.get(modifyItem.id);

        req.onsuccess = () => {
            let updateReq;
            let newItem = req.result ?? modifyItem;
            for (const key in modifyItem) {
                if (key !== "id") {
                    const val = modifyItem[key];
                    if (!val || (typeof val === "string" && val.trim() === "")) {
                        delete newItem[key];
                    } else {
                        newItem[key] = val;
                    }
                }
            }
            // delete if only has c and id
            if (Object.keys(newItem).length === 1 || (Object.keys(newItem).length === 2 && newItem.hasOwnProperty('c'))) {
                updateReq = store.delete(newItem.id);
                newItem = null;
            } else {
                updateReq = store.put(newItem);
            }
            updateReq.onsuccess = () => resolve(newItem);
            updateReq.onerror = () => reject(updateReq.error);
        };

        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
        tx.onerror = () => reject(tx.error);
    });
}


export async function removeField(tableId: IDBValidKey, field: string) {
    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(tableId.toString(), "readwrite");
        const store = tx.objectStore(tableId.toString());
        const req = store.getAll();
        req.onsuccess = () => {
            const items = req.result;
            items.forEach(item => {
                if (!item[field]) return;
                delete item[field];
                store.put(item);
            });
            resolve();
        };
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
        tx.onerror = () => reject(tx.error);
    });
}

export async function removeFieldMetadata(tableId: IDBValidKey, field: string) {
    await removeField(tableId, field);
    const db = await openDB();
    return new Promise<string[]>((resolve, reject) => {
        const tx = db.transaction(METADATA_STORE_NAME, "readwrite");
        const store = tx.objectStore(METADATA_STORE_NAME);
        const req = store.get(tableId);
        req.onsuccess = () => {
            const table = req.result as Table;
            if (table) {
                table.fields = table.fields.filter((f) => f !== field);
                const updateReq = store.put(table);
                if (table.fields.length === 0) {
                    store.delete(tableId);
                }
                updateReq.onsuccess = () => resolve(table.fields);
                updateReq.onerror = () => reject(updateReq.error);
            } else {
                reject(new Error(`Table ${tableId} not found`));
            }
        };
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
        tx.onerror = () => reject(tx.error);
    });
}

export async function addFieldMetadata(tableId: IDBValidKey, field: string, oldField?: string) {
    const db = await openDB();
    return new Promise<string>((resolve, reject) => {
        const tx = db.transaction(METADATA_STORE_NAME, "readwrite");
        const store = tx.objectStore(METADATA_STORE_NAME);
        const req = store.get(tableId);
        req.onsuccess = () => {
            const table = req.result as Table;
            if (table) {
                if (oldField) {
                    if (table.fields.includes(oldField)) {
                        table.fields[table.fields.indexOf(oldField)] = field;
                    } else {
                        reject(new Error(`Field ${oldField} does not exist in table ${table.name}`));
                    }
                } else {
                    if (table.fields.includes(field)) {
                        reject(new Error(`Field ${field} already exists in table ${table.name}`));
                    } else {
                        table.fields.push(field);
                    }
                }
                const updateReq = store.put(table);
                updateReq.onsuccess = () => resolve(field);
                updateReq.onerror = () => reject(updateReq.error);
            } else {
                reject(new Error(`Table ${tableId} not found`));
            }
        };
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
        tx.onerror = () => reject(tx.error);
    });
}

// export async function gettableIds() {
//     const db = await openDB();
//     return new Promise<string[]>((resolve, reject) => {
//         const names = Array.from(db.objectStoreNames);
//         resolve(names as string[]);
//     });
// }

export async function setTableMetadata(table: Table) {
    const db = await openDB();
    return new Promise<IDBValidKey>((resolve, reject) => {
        const tx = db.transaction(METADATA_STORE_NAME, "readwrite");
        const store = tx.objectStore(METADATA_STORE_NAME);
        const req = store.put(table);

        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
        tx.onerror = () => reject(tx.error);
    });
}

export async function deleteTableMetadata(tableId: IDBValidKey) {
    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(METADATA_STORE_NAME, "readwrite");
        const store = tx.objectStore(METADATA_STORE_NAME);
        const req = store.delete(tableId);

        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
        tx.onerror = () => reject(tx.error);
    });
}

export async function getTableMetadata(tableId: IDBValidKey): Promise<Table> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(METADATA_STORE_NAME, "readonly");
        const store = tx.objectStore(METADATA_STORE_NAME);
        const req = store.get(tableId);

        req.onsuccess = () => resolve(req.result as Table);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
        tx.onerror = () => reject(tx.error);
    });
}

export async function getAllTableMetadata(): Promise<Table[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(METADATA_STORE_NAME, "readonly");
        const store = tx.objectStore(METADATA_STORE_NAME);
        const req = store.getAll();

        req.onsuccess = () => resolve(req.result as Table[]);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
        tx.onerror = () => reject(tx.error);
    });
}