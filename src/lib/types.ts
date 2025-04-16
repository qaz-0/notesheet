export interface Item {
    id: IDBValidKey;
    [key: string]: any;
}

export interface Table {
    id?: IDBValidKey;
    name: string;
    color: string;
    secondaryColor?: string;
    fields: string[];
}

export type CheckboxState = undefined | 0 | 1 | 2;
