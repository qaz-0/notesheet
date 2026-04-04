import * as db from "./db";
import type { Table, Item, Field } from "./types";
import type { SyncAction } from "./syncTypes";
import type { SyncManager } from "./sync";

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
      timestamp: Date.now(),
    };
  }

  // For sync with deviceId and vectorClock
  toSyncAction(
    deviceId: string,
    vectorClock: Record<string, number>,
  ): SyncAction {
    return {
      action: this.getActionName(),
      args: this.doArgs,
      timestamp: Date.now(),
      deviceId,
      vectorClock: { ...vectorClock },
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
  private syncManager: SyncManager | null = null;
  private debounceTimer: number | null = null;
  private readonly DEBOUNCE_MS = 50;

  constructor() {
    // setInterval(this.sendData, 1000); // Every 60 seconds
  }

  // Schedule a debounced update to batch rapid actions
  private scheduleUpdate(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(async () => {
      this.debounceTimer = null;
      if (this.updateCallback) {
        await this.updateCallback();
      }
    }, this.DEBOUNCE_MS) as unknown as number;
  }

  // Flush pending updates immediately (for when immediate refresh is needed)
  public async flushUpdates(): Promise<void> {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
      if (this.updateCallback) {
        console.log(this.updateCallback == null);
        await this.updateCallback();
      }
    }
  }

  // Connect to sync infrastructure
  public setSyncManager(sync: SyncManager): void {
    this.syncManager = sync;

    // Set up the action applier for remote actions
    sync.setActionApplier(async (syncAction: SyncAction) => {
      await this.applyRemoteAction(syncAction);
    });
  }

  // Apply a remote action without re-queueing for sync
  public async applyRemoteAction(syncAction: SyncAction): Promise<void> {
    const ActionClass = getActionClass(syncAction.action);
    if (!ActionClass) {
      console.warn(`Unknown action type: ${syncAction.action}`);
      return;
    }

    const action = new ActionClass(...(syncAction.args as any[]));
    await action.execute();

    // Trigger UI update
    this.scheduleUpdate();

    // Note: Don't add to syncableActions or actionHistory
    // Remote actions shouldn't be re-synced or undoable locally
  }

  public async sendData() {
    const data = this.syncableActions;
    if (data.length === 0) return;
    try {
      const response = await fetch("https://example.com/api/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ actions: data }),
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
    console.log("executing action", action)
    const result = await action.execute();
    this.actionHistory.push(action);
    this.syncableActions.push(action.toJSON());

    // Queue for sync if connected to sync manager
    if (this.syncManager) {
      const syncAction = action.toSyncAction(
        this.syncManager.deviceId,
        this.syncManager.vectorClock,
      );
      await this.syncManager.queueAction(syncAction);
    }

    // Clear redo stack when new action is performed
    this.redoStack = [];

    // Trigger UI update (debounced)
    this.scheduleUpdate();

    return result;
  }

  public async undo(): Promise<boolean> {
    if (this.actionHistory.length === 0) {
      return false;
    }

    const action = this.actionHistory.pop()!;
    console.log("action to undo:", action);

    if (!action.hasUndoArgs()) {
      throw new Error("Cannot undo: action has not been executed properly");
    }

    await action.undo();
    this.syncableActions.pop();
    this.redoStack.push(action);

    // Trigger UI update (debounced)
    this.scheduleUpdate();

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

    // Trigger UI update (debounced)
    this.scheduleUpdate();

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

  public canUndo(): boolean {
    return this.actionHistory.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}

// Export singleton instance
export const actionManager = new ActionManager();

// Action registry for deserializing remote actions
// Uses lazy initialization to avoid circular dependency issues
type ActionConstructor = new (...args: any[]) => Action;

let actionRegistry: Map<string, ActionConstructor> | null = null;
let registryInitialized = false;

async function initializeRegistry(): Promise<void> {
  if (registryInitialized) return;

  const actionTypes = await import("./actionTypes");
  actionRegistry = new Map<string, ActionConstructor>([
    ["ResetDB", actionTypes.ResetDBAction],
    ["ImportDataFromJson", actionTypes.ImportDataFromJsonAction],
    ["CreateTable", actionTypes.CreateTableAction],
    ["DeleteTable", actionTypes.DeleteTableAction],
    ["EditItem", actionTypes.EditItemAction],
    ["DeleteItem", actionTypes.DeleteItemAction],
    ["MarkAsDoneAction", actionTypes.MarkAsDoneAction],
    ["InsertItem", actionTypes.InsertItemAction],
    ["ShiftItems", actionTypes.ShiftItemsAction],
    ["ShiftItemsSide", actionTypes.ShiftItemsSideAction],
    ["AddFieldMetadata", actionTypes.AddFieldMetadataAction],
    ["RemoveFieldMetadata", actionTypes.RemoveFieldMetadataAction],
    ["UpdateFieldMetadata", actionTypes.UpdateFieldMetadataAction],
    ["RenameTable", actionTypes.RenameTableAction]
  ]);
  registryInitialized = true;
}

// Initialize registry immediately (but asynchronously)
initializeRegistry();

export function getActionClass(
  actionName: string,
): ActionConstructor | undefined {
  return actionRegistry?.get(actionName);
}

export function registerAction(
  name: string,
  ActionClass: ActionConstructor,
): void {
  if (actionRegistry) {
    actionRegistry.set(name, ActionClass);
  }
}
