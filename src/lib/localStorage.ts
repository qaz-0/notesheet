interface Deleted {
    tableId: IDBValidKey,
    id: IDBValidKey;
}

export function getDeleted(): Array<Deleted> {
    let deleted = localStorage.getItem("deleted");
    if (!deleted) {
        resetDeleted();
        return [];
    }

    return JSON.parse(deleted);
}

export function setDeleted(data: Array<Deleted>) {
    localStorage.setItem("deleted", JSON.stringify(data));
}

export function addDeleted(tableId: IDBValidKey, id: IDBValidKey) {
    let data: Array<Deleted> = getDeleted();
    let newDeleted: Deleted = {
        tableId: tableId,
        id: id
    };
    data.push(newDeleted);
    setDeleted(data);
}

export function resetDeleted() {
    localStorage.setItem("deleted", JSON.stringify([]));
}
