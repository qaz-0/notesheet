export interface Item {
    id: IDBValidKey;
    [key: string]: any;
}

// id will be column number by default
export interface Field {
    id?: string,
    name: string,
    size: number,
}

export interface Table {
    id?: IDBValidKey;
    name: string;
    color: string;
    secondaryColor?: string;
    fields: Field[];
}

export type CheckboxState = undefined | 0 | 1 | 2;
