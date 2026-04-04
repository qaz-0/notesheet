import { Action } from "./actions";
import * as db from "./db";
import type { Table, Item, Field } from "./types";

export class ResetDBAction extends Action {
    static readonly actionName = "ResetDB"

    constructor() {
        super();
    }

    async execute(): Promise<void> {
        const allData = await db.getAllTableMetadata();
        const exportData: { metadata: Table, items: Item[] }[] = [];

        for (const metadata of allData) {
            if (metadata.id) {
                const items = await db.getTable(metadata.id);
                exportData.push({ metadata, items });
            }
        }

        await db.resetDB();
        this.setUndoArgs(this.generateUndoArgs(JSON.stringify(exportData)));
    }

    async undo(): Promise<void> {
        const [jsonString] = this.undoArgs!;
        await db.importDataFromJson(jsonString);
    }

    protected generateUndoArgs(result: any): any[] {
        return [result];
    }
}

export class ImportDataFromJsonAction extends Action {
    static readonly actionName = "ImportDataFromJson"

    private jsonString: string;

    constructor(jsonString: string) {
        super(jsonString);
        this.jsonString = jsonString;
    }

    async execute(): Promise<void> {
        const allData = await db.getAllTableMetadata();
        const exportData: { metadata: Table, items: Item[] }[] = [];

        for (const metadata of allData) {
            if (metadata.id) {
                const items = await db.getTable(metadata.id);
                exportData.push({ metadata, items });
            }
        }

        await db.importDataFromJson(this.jsonString);
        this.setUndoArgs(this.generateUndoArgs(JSON.stringify(exportData)));
    }

    async undo(): Promise<void> {
        const [oldJsonString] = this.undoArgs!;
        await db.importDataFromJson(oldJsonString);
    }

    protected generateUndoArgs(result: any): any[] {
        return [result];
    }
}

export class CreateTableAction extends Action {
    static readonly actionName = "CreateTable"

    private table: Table;

    constructor(table: Table) {
        super(table);
        this.table = table;
    }

    async execute(): Promise<Table> {
        const createdTable = await db.createTable(this.table);
        this.setUndoArgs(this.generateUndoArgs(createdTable));
        return createdTable;
    }

    async undo(): Promise<void> {
        const [tableId] = this.undoArgs!;
        await db.deleteTable(tableId);
    }

    protected generateUndoArgs(result: Table): any[] {
        return [result.id!];
    }
}

export class DeleteTableAction extends Action {
    static readonly actionName = "DeleteTable"

    private tableId: IDBValidKey;

    constructor(tableId: IDBValidKey) {
        super(tableId);
        this.tableId = tableId;
    }

    async execute(): Promise<void> {
        const tableMetadata = await db.getTableMetadata(this.tableId);
        const items = await db.getTable(this.tableId);
        await db.deleteTable(this.tableId);
        this.setUndoArgs(this.generateUndoArgs({ metadata: tableMetadata, items }));
    }

    async undo(): Promise<void> {
        const [tableData] = this.undoArgs!;
        const createdTable = await db.createTable(tableData.metadata);

        // Restore items
        for (const item of tableData.items) {
            await db.putItem(createdTable.id!, item);
        }
    }

    protected generateUndoArgs(result: any): any[] {
        return [result];
    }
}

export class EditItemAction extends Action {
    static readonly actionName = "EditItem"
    private tableId: IDBValidKey;
    private item: Item;

    constructor(tableId: IDBValidKey, item: Item) {
        super(tableId, item);
        this.tableId = tableId;
        this.item = item;
    }

    async execute(): Promise<Item | null> {
        const oldItem = await db.getItemById(this.tableId, this.item.id);
        const result = await db.editItem(this.tableId, this.item);
        this.setUndoArgs(this.generateUndoArgs(oldItem));
        return result;
    }

    async undo(): Promise<void> {
        const [oldItem] = this.undoArgs!;
        if (oldItem) {
            // set the difference to empty string
            for (const key in this.item) {
                if (!(key in oldItem)) {
                    (oldItem as any)[key] = "";
                }
            }
            await db.editItem(this.tableId, oldItem);
        } else {
            // Item didn't exist before, delete it
            const tableStoreName = this.tableId.toString();
            const dbInstance = await db.openDB();
            await new Promise<void>((resolve, reject) => {
                const tx = dbInstance.transaction(tableStoreName, "readwrite");
                const store = tx.objectStore(tableStoreName);
                const req = store.delete(this.item.id);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
                tx.oncomplete = () => dbInstance.close();
            });
        }
    }

    protected generateUndoArgs(oldItem: Item | null): any[] {
        return [oldItem];
    }
}

export class DeleteItemAction extends Action {
    static readonly actionName = "DeleteItem"
    private tableId: IDBValidKey;
    private id: IDBValidKey;

    constructor(tableId: IDBValidKey, id: IDBValidKey) {
        super(tableId, id);
        this.tableId = tableId;
        this.id = id;
    }

    async execute(): Promise<void> {
        const item = await db.getItemById(this.tableId, this.id);
        await db.deleteItem(this.tableId, this.id);
        this.setUndoArgs(this.generateUndoArgs(item));
    }

    async undo(): Promise<void> {
        const [deletedItem] = this.undoArgs!;
        if (deletedItem) {
            await db.insertItem(this.tableId, deletedItem.id, deletedItem);
        }
    }

    protected generateUndoArgs(item: Item | null): any[] {
        return [item];
    }
}

export class MarkAsDoneAction extends Action {
    static readonly actionName = "MarkAsDoneAction"
    private tableId: IDBValidKey;
    private id: IDBValidKey;

    constructor(tableId: IDBValidKey, id: IDBValidKey) {
        super(tableId, id);
        this.tableId = tableId;
        this.id = id;
    }

    async execute(): Promise<void> {
        const item = await db.getItemById(this.tableId, this.id);
        if (item) item.c = 1;
        await db.markAsDone(this.tableId, this.id);
        this.setUndoArgs(this.generateUndoArgs(item));
    }

    async undo(): Promise<void> {
        const [item] = this.undoArgs!;
        if (item) {
            await db.editItem(this.tableId, item);

            const historyTable = await db.getHistoryTableMetadata();
            if (historyTable && historyTable.id) {
                await db.shiftItems(historyTable.id, 0, true);
            }
        }
    }

    protected generateUndoArgs(item: Item | null): any[] {
        return [item];
    }
}

export class InsertItemAction extends Action {
    static readonly actionName = "InsertItem"
    private tableId: IDBValidKey;
    private id: IDBValidKey;
    private item: Item;

    constructor(tableId: IDBValidKey, id: IDBValidKey, item: Item) {
        super(tableId, id, item);
        this.tableId = tableId;
        this.id = id;
        this.item = item;
    }

    async execute(): Promise<void> {
        await db.insertItem(this.tableId, this.id, this.item);
        this.setUndoArgs(this.generateUndoArgs(null));
    }

    async undo(): Promise<void> {
        await db.deleteItem(this.tableId, this.id);
    }

    protected generateUndoArgs(result: any): any[] {
        return [this.tableId, this.id];
    }
}

export class ShiftItemsAction extends Action {
    static readonly actionName = "ShiftItems"
    private tableId: IDBValidKey;
    private id: IDBValidKey;
    private up: boolean;
    private itemData: Item | null = null;

    constructor(tableId: IDBValidKey, id: IDBValidKey, up: boolean = true) {
        super(tableId, id, up);
        this.tableId = tableId;
        this.id = id;
        this.up = up;
    }

    async execute(): Promise<void> {
        const item = await db.getItemById(this.tableId, this.id);
        await db.shiftItems(this.tableId, this.id, this.up);
        this.setUndoArgs(this.generateUndoArgs(item));
    }

    async undo(): Promise<void> {
        const [tableId, id, up, itemData] = this.undoArgs!;
        await db.shiftItems(tableId, id, !up);
        if (itemData) {
            await db.putItem(tableId, itemData);
        }
    }

    protected generateUndoArgs(item: Item | null): any[] {
        return [this.tableId, this.id, this.up, item];
    }
}

export class ShiftItemsSideAction extends Action {
    static readonly actionName = "ShiftItemsSide"
    private tableId: IDBValidKey;
    private fieldPosition: number;
    private right: boolean;

    constructor(tableId: IDBValidKey, fieldPosition: number, right: boolean = true) {
        super(tableId, fieldPosition, right);
        this.tableId = tableId;
        this.fieldPosition = fieldPosition;
        this.right = right;
    }

    async execute(): Promise<void> {
        await db.shiftItemsSide(this.tableId, this.fieldPosition, this.right);
        this.setUndoArgs(this.generateUndoArgs(null));
    }

    async undo(): Promise<void> {
        const [tableId, fieldPosition, right] = this.undoArgs!;
        await db.shiftItemsSide(tableId, fieldPosition, !right);
    }

    protected generateUndoArgs(result: any): any[] {
        return [this.tableId, this.fieldPosition, this.right];
    }
}

export class AddFieldMetadataAction extends Action {
    static readonly actionName = "AddFieldMetadata"
    private tableId: IDBValidKey;
    private field: Field;
    private fieldPosition?: number;

    constructor(tableId: IDBValidKey, field: Field, fieldPosition?: number) {
        super(tableId, field, fieldPosition);
        this.tableId = tableId;
        this.field = field;
        this.fieldPosition = fieldPosition;
        console.log(Number(tableId), field, fieldPosition)
    }

    async execute(): Promise<Field> {
        const oldTableMetadata = await db.getTableMetadata(this.tableId);
        const result = await db.addFieldMetadata(this.tableId, this.field, this.fieldPosition);
        this.setUndoArgs(this.generateUndoArgs({ oldFields: oldTableMetadata.fields, newField: result }));
        return result;
    }

    async undo(): Promise<void> {
        const [undoData] = this.undoArgs!;
        await db.removeFieldMetadata(this.tableId, undoData.newField, this.fieldPosition);
    }

    protected generateUndoArgs(result: any): any[] {
        return [result];
    }
}

export class RemoveFieldMetadataAction extends Action {
    static readonly actionName = "RemoveFieldMetadata"
    private tableId: IDBValidKey;
    private field: Field;
    private fieldPosition?: number;

    constructor(tableId: IDBValidKey, field: Field, fieldPosition?: number) {
        super(tableId, field, fieldPosition);
        this.tableId = tableId;
        this.field = field;
        this.fieldPosition = fieldPosition;
    }

    async execute(): Promise<Field[]> {
        const items = await db.getTable(this.tableId);
        const columnData = items.map(item => {
            const val = this.field.id ? item[this.field.id] : (this.fieldPosition !== undefined ? item[this.fieldPosition] : undefined);
            return { id: item.id, val };
        }).filter(d => d.val !== undefined);

        const result = await db.removeFieldMetadata(this.tableId, this.field, this.fieldPosition);
        const plainField = JSON.parse(JSON.stringify(this.field));
        this.setUndoArgs(this.generateUndoArgs({ field: plainField, columnData }));
        return result;
    }

    async undo(): Promise<void> {
        const [undoData] = this.undoArgs!;

        // Before adding the restored field back, shift current fields right to carve space in IDB Items
        if (this.fieldPosition !== undefined) {
             await db.shiftItemsSide(this.tableId, this.fieldPosition, true);
        }

        await db.addFieldMetadata(this.tableId, undoData.field, this.fieldPosition, true);
        
        if (undoData.columnData) {
            for (const data of undoData.columnData) {
                const item = await db.getItemById(this.tableId, data.id);
                if (item) {
                    if (undoData.field.id) {
                        item[undoData.field.id] = data.val;
                    } else if (this.fieldPosition !== undefined) {
                        item[this.fieldPosition] = data.val;
                    }
                    await db.putItem(this.tableId, item);
                } else {
                    const newItem: Item = { id: data.id };
                    if (undoData.field.id) {
                        newItem[undoData.field.id] = data.val;
                    } else if (this.fieldPosition !== undefined) {
                        newItem[this.fieldPosition] = data.val;
                    }
                    await db.putItem(this.tableId, newItem);
                }
            }
        }
    }

    protected generateUndoArgs(undoData: any): any[] {
        return [undoData];
    }
}

export class UpdateFieldMetadataAction extends Action {
    static readonly actionName = "UpdateFieldMetadata"
    private tableId: IDBValidKey;
    private field: Field;
    private fieldPosition: number;

    constructor(tableId: IDBValidKey, field: Field, fieldPosition: number) {
        super(tableId, field, fieldPosition);
        this.tableId = tableId;
        this.field = field;
        this.fieldPosition = fieldPosition;
    }

    async execute(): Promise<Field> {
        const oldTableMetadata = await db.getTableMetadata(this.tableId);
        const oldField = JSON.parse(JSON.stringify(oldTableMetadata.fields[this.fieldPosition]));
        const result = await db.addFieldMetadata(this.tableId, this.field, this.fieldPosition);
        this.setUndoArgs(this.generateUndoArgs(oldField));
        return result;
    }

    async undo(): Promise<void> {
        const [oldField] = this.undoArgs!;
        await db.addFieldMetadata(this.tableId, oldField, this.fieldPosition);
    }

    protected generateUndoArgs(result: any): any[] {
        return [result];
    }
}

export class RenameTableAction extends Action {
    static readonly actionName = "RenameTable"
    private tableId: IDBValidKey;
    private newName: string;

    constructor(tableId: IDBValidKey, newName: string) {
        super(tableId, newName);
        this.tableId = tableId;
        this.newName = newName;
    }

    async execute(): Promise<void> {
        const table = await db.getTableMetadata(this.tableId);
        const oldName = table.name;
        table.name = this.newName;
        await db.setTableMetadata(table);
        this.setUndoArgs(this.generateUndoArgs(oldName));
    }

    async undo(): Promise<void> {
        const [oldName] = this.undoArgs!;
        if (oldName !== undefined) {
            const table = await db.getTableMetadata(this.tableId);
            table.name = oldName;
            await db.setTableMetadata(table);
        }
    }

    protected generateUndoArgs(oldName: string): any[] {
        return [oldName];
    }
}