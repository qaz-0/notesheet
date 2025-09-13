import { get } from "svelte/store";
import type { Field, Item, Table } from "./types";

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
            reject(new Error(`Table store ${tableId} already exists`));
        } else {
            db.close();
            const version = db.version + 1;
            const upgradeReq = indexedDB.open(DB_NAME, version);
            table.id = tableId;

            upgradeReq.onupgradeneeded = (event) => {
                const upgradeDb = (event.target as IDBOpenDBRequest).result;
                const store = upgradeDb.createObjectStore(tableId.toString(), { keyPath: "id" });
                store.createIndex("idIndex", "id", { unique: true });
            };

            upgradeReq.onsuccess = () => {
                upgradeReq.result.close();
                resolve(table);
            };
            upgradeReq.onerror = () => reject(upgradeReq.error);
        }
    });
}

export async function deleteTable(tableId: IDBValidKey) {
    let tableStoreName = tableId.toString();

    // First delete the metadata
    await deleteTableMetadata(tableId);

    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
        if (!db.objectStoreNames.contains(tableStoreName)) {
            db.close();
            resolve();
            return;
        }

        db.close();
        const version = db.version + 1;
        const upgradeReq = indexedDB.open(DB_NAME, version);

        upgradeReq.onupgradeneeded = (event) => {
            const upgradeDb = (event.target as IDBOpenDBRequest).result;
            if (upgradeDb.objectStoreNames.contains(tableStoreName)) {
                upgradeDb.deleteObjectStore(tableStoreName);
            }
        };

        upgradeReq.onsuccess = () => {
            const newDb = upgradeReq.result;
            newDb.close();
            resolve();
        };

        upgradeReq.onerror = () => reject(upgradeReq.error);
    });
}

export async function getTable(tableId: IDBValidKey) {
    let tableStoreName = tableId.toString()
    // const fields = (await getTableMetadata(tableId)).fields;
    // console.log(fields)
    const db = await openDB();
    return new Promise<Item[]>((resolve, reject) => {
        const tx = db.transaction(tableStoreName, "readonly");
        const store = tx.objectStore(tableStoreName);
        const index = store.index("idIndex");
        const req = index.getAll();
        // const req = index.openCursor(null);
        // const data: Item[] = [];

        req.onsuccess = () => {
            resolve(req.result);
            // const cur = req.result;
            // if (cur) {
            //     const item = cur.value;
            //     data.push(item);
            //     cur.continue();
            // } else {
            //     resolve(data);
            // }
        };
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
        tx.onerror = () => reject(tx.error);
    });
}

export async function getHistoryTableMetadata(): Promise<Table | null> {
    const metadata = await getAllTableMetadata();
    const historyTable = metadata.find(table => table.name.toLowerCase() === "history");
    if (!historyTable) {
        return null;
    }
    return historyTable;
}

export async function deleteItem(tableId: IDBValidKey, id: IDBValidKey) {
    const item = await getItemById(tableId, id);
    if (!item) {
        return false;
    }

    const tableMetadata = await getTableMetadata(tableId);
    const fields = (await getTableMetadata(tableId)).fields;

    let historyTableMetadata = await getHistoryTableMetadata();
    if (historyTableMetadata) {
        let hTableId = historyTableMetadata.id!;
        let hTableFields = historyTableMetadata.fields;
        console.log("shift down");
        await shiftItems(hTableId, 0, false);

        const historyItem: Item = { id: 0, k: tableMetadata.secondaryColor};

        if (item) {
            for (let i = 0; i < hTableFields.length; i++) {
                let hTableField = hTableFields[i];
                if (hTableField.id) continue;
                let keyIndex = fields.findIndex((f) => f.name == hTableField.name);
                if (keyIndex !== -1) {
                    historyItem[i] = item[keyIndex];
                }
            }
            await editItem(hTableId, historyItem);
        }
    }
    console.log("shift up");
    await shiftItems(tableId, id, true);
}

export async function shiftItems(tableId: IDBValidKey, id: IDBValidKey, up: boolean = true) {
    let tableStoreName = tableId.toString();
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(tableStoreName, "readwrite");
        const store = tx.objectStore(tableStoreName);
        const index = store.index("idIndex");
        if (up) {
            store.delete(id);
            const req = index.openCursor(IDBKeyRange.lowerBound(id, true));
            req.onsuccess = () => {
                const cur = req.result;
                if (cur) {
                    const item = cur.value;
                    store.delete(item.id);
                    item.id = item.id - 1;
                    store.put(item);
                    cur.continue();
                }
            }
        } else {
            // down
            const req = index.openCursor(IDBKeyRange.lowerBound(id), 'prev');
            req.onsuccess = () => {
                const cur = req.result;
                if (cur) {
                    const item = cur.value;
                    store.delete(item.id);
                    item.id = item.id + 1;
                    store.put(item);
                    cur.continue();
                }
            };
        }
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
    });
}

export async function shiftItemsSide(tableId: IDBValidKey, fieldPosition: number, right: boolean = true) {
    let tableStoreName = tableId.toString();
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(tableStoreName, "readwrite");
        const store = tx.objectStore(tableStoreName);
        const index = store.index("idIndex");
        if (right) {
            const req = index.openCursor();
            req.onsuccess = () => {
                const cur = req.result;
                if (cur) {
                    const item = cur.value;
                    Object.keys(item).map((key) => {
                        const pos = parseInt(key);
                        if (pos >= fieldPosition) {
                            let descriptor = Object.getOwnPropertyDescriptor(item, pos)!;
                            Object.defineProperty(item, pos + 1, descriptor);
                            delete item[pos];
                        }
                    })
                    store.put(item);
                    cur.continue();
                }
            };
        } else {
            // left
            const req = index.openCursor();
            req.onsuccess = () => {
                const cur = req.result;
                if (cur) {
                    const item = cur.value;
                    Object.keys(item).map((key) => {
                        const pos = parseInt(key);
                        if (pos > fieldPosition) {
                            let descriptor = Object.getOwnPropertyDescriptor(item, pos)!;
                            Object.defineProperty(item, pos - 1, descriptor);
                            delete item[pos];
                        }
                    })
                    store.put(item);
                    cur.continue();
                }
            };
        }
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
            const item = req.result;
            if (item) {
                resolve(item);
            } else {
                resolve(null);
            }
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


export async function removeField(tableId: IDBValidKey, field: Field, fieldPosition?: number) {
    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(tableId.toString(), "readwrite");
        const store = tx.objectStore(tableId.toString());
        const req = store.getAll();
        req.onsuccess = () => {
            const items = req.result;
            if (field.id) {
                items.forEach(item => {
                    if (!item[field.id!]) return;
                    delete item[field.id!];
                    store.put(item);
                });
            } else if (fieldPosition !== undefined) {
                items.forEach(item => {
                    if (!item[fieldPosition]) return;
                    delete item[fieldPosition];
                    store.put(item);
                });
            }
            resolve();
        };
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
        tx.onerror = () => reject(tx.error);
    });
}

export async function removeFieldMetadata(tableId: IDBValidKey, field: Field, fieldPosition?: number) {
    await removeField(tableId, field, fieldPosition);
    if (fieldPosition !== undefined) await shiftItemsSide(tableId, fieldPosition, false);
    const db = await openDB();
    return new Promise<Field[]>((resolve, reject) => {
        const tx = db.transaction(METADATA_STORE_NAME, "readwrite");
        const store = tx.objectStore(METADATA_STORE_NAME);
        const req = store.get(tableId);
        req.onsuccess = () => {
            const table = req.result as Table;
            if (table) {
                if (field.id) {
                    table.fields = table.fields.filter((f) => f.id !== field.id);
                } else if (fieldPosition !== undefined) {
                    table.fields = table.fields.filter((f, index) => index !== fieldPosition);
                    console.log(table);
                }
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

export async function addFieldMetadata(tableId: IDBValidKey, field: Field, fieldPosition?: number) {
    const db = await openDB();
    return new Promise<Field>((resolve, reject) => {
        const tx = db.transaction(METADATA_STORE_NAME, "readwrite");
        const store = tx.objectStore(METADATA_STORE_NAME);
        const req = store.get(tableId);
        req.onsuccess = () => {
            const table = req.result as Table;
            if (table) {
                let oldField;
                if (field.id) {
                    oldField = table.fields.find((f)=>f.id === field.id);
                } else if (fieldPosition !== undefined) {
                    oldField = table.fields[fieldPosition];
                }
                if (oldField) {
                    Object.assign(oldField, field);
                } else {
                    // if field position or field id does not exist
                    table.fields.push(field);
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


/**
 * Exports all tables and their data to a single JSON file and triggers a download.
 */
export async function exportDataToJson() {
    try {
        const allMetadata = await getAllTableMetadata();
        const exportData = [];

        for (const metadata of allMetadata) {
            if (metadata.id) {
                const items = await getTable(metadata.id);
                exportData.push({ metadata, items });
            }
        }

        const jsonString = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `notesheet-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error("Failed to export data:", error);
        alert("Failed to export data. See console for details.");
    }
}

/**
 * Imports data from a JSON string, wiping the existing database and restoring the state.
 * @param jsonString The JSON string containing the backup data.
 */
export async function importDataFromJson(jsonString: string): Promise<void> {
    if (!confirm("This will clear all existing data. Are you sure you want to proceed?")) {
        return;
    }
    try {
        const importData: { metadata: Table, items: Item[] }[] = JSON.parse(jsonString);

        if (!Array.isArray(importData) || !importData.every(d => d.metadata && d.items !== undefined)) {
            throw new Error("Invalid JSON format for import.");
        }

        await resetDB();

        const db = await openDB();
        const version = db.version + 1;
        db.close();

        const openRequest = indexedDB.open(DB_NAME, version);

        return new Promise<void>((resolve, reject) => {
            openRequest.onupgradeneeded = (event) => {
                const upgradeDb = (event.target as IDBOpenDBRequest).result;
                for (const { metadata } of importData) {
                    if (metadata.id && !upgradeDb.objectStoreNames.contains(metadata.id.toString())) {
                        const store = upgradeDb.createObjectStore(metadata.id.toString(), { keyPath: 'id' });
                        store.createIndex('idIndex', 'id', { unique: true });
                    }
                }
            };

            openRequest.onsuccess = async () => {
                const newDb = openRequest.result;
                const tableIds = importData.map(({ metadata }) => metadata.id!.toString()).filter(Boolean);

                const metadataTx = newDb.transaction(METADATA_STORE_NAME, 'readwrite');
                const metadataStore = metadataTx.objectStore(METADATA_STORE_NAME);
                importData.forEach(({ metadata }) => metadataStore.put(metadata));

                await new Promise(res => metadataTx.oncomplete = res);

                if (tableIds.length > 0) {
                    const dataTx = newDb.transaction(tableIds, 'readwrite');
                    importData.forEach(({ metadata, items }) => {
                        if (metadata.id) {
                            const itemStore = dataTx.objectStore(metadata.id.toString());
                            items.forEach(item => itemStore.put(item));
                        }
                    });
                    dataTx.oncomplete = () => {
                        newDb.close();
                        resolve();
                    };
                    dataTx.onerror = () => {
                        newDb.close();
                        reject(dataTx.error);
                    };
                } else {
                    newDb.close();
                    resolve();
                }
            };

            openRequest.onerror = () => reject(openRequest.error);
        });
    } catch (error) {
        console.error("Failed to import data:", error);
        alert("Failed to import data. Check file format and console for details.");
        throw error;
    }
}