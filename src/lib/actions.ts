import * as db from "./db";
import type { Table, Item, Field } from "./types";

export abstract class Action {
    static readonly actionName: string;

    protected doArgs: any[];
    protected undoArgs: any[] | null = null;

    constructor(...doArgs: any[]) {
        this.doArgs = doArgs;
    }

    abstract execute(): Promise<any>;
    abstract undo(): Promise<any>;

    // Generate undo arguments after execution
    protected abstract generateUndoArgs(result: any): any[];

    // For server synchronization
    toJSON(): object {
        return {
            action: this.getActionName(),
            args: this.doArgs,
            timestamp: Date.now()
        };
    }

    public hasUndoArgs(): boolean {
        return this.undoArgs !== null;
    }

    protected setUndoArgs(args: any[]): void {
        this.undoArgs = args;
    }

    protected getActionName(): string {
        const ctor = this.constructor as typeof Action;
        return ctor.actionName;
    }
}

export class ActionManager {
    private actionHistory: Action[] = [];
    private redoStack: Action[] = [];
    private syncableActions: object[] = [];
    private updateCallback: (() => Promise<void>) | null = null;

    constructor() {
        // setInterval(this.sendData, 1000); // Every 60 seconds
    }

    public async sendData() {
        const data = this.syncableActions;
        if (data.length === 0) return;
        try {
            const response = await fetch('https://example.com/api/sync', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ actions: data })
            });
            if (response.ok) {
                this.syncableActions = [];
            } else {

                // console.error('Failed to synchronize data:', response.statusText);
            }
        } catch (error) {
            // console.error('Error during synchronization:', error);
        }
    }

    public async executeAction(action: Action): Promise<any> {
        const result = await action.execute();
        this.actionHistory.push(action);
        this.syncableActions.push(action.toJSON());
        // Clear redo stack when new action is performed
        this.redoStack = [];
        return result;
    }

    public async undo(): Promise<boolean> {
        if (this.actionHistory.length === 0) {
            return false;
        }

        const action = this.actionHistory.pop()!;
        console.log('action to undo:', action);

        if (!action.hasUndoArgs()) {
            throw new Error('Cannot undo: action has not been executed properly');
        }

        await action.undo();
        this.syncableActions.pop();
        this.redoStack.push(action);

        if (this.updateCallback) {
            await this.updateCallback();
        }

        return true;
    }

    public async redo(): Promise<boolean> {
        if (this.redoStack.length === 0) {
            return false;
        }

        const action = this.redoStack.pop()!;
        await action.execute();
        this.actionHistory.push(action);
        this.syncableActions.push(action.toJSON());

        if (this.updateCallback) {
            await this.updateCallback();
        }

        return true;
    }

    public setUpdateCallback(callback: () => Promise<void>) {
        this.updateCallback = callback;
    }

    public getSyncableActions(): object[] {
        return [...this.syncableActions];
    }

    public clearHistory(): void {
        this.actionHistory = [];
        this.redoStack = [];
        this.syncableActions = [];
    }

    public getHistorySize(): number {
        return this.actionHistory.length;
    }

    public getRedoSize(): number {
        return this.redoStack.length;
    }
}

// Export singleton instance
export const actionManager = new ActionManager();
