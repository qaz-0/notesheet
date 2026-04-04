/// <reference lib="dom" />
import { Direction } from "./types";

export function getCell(
  currentCell: HTMLTableCellElement,
  direction: Direction,
): HTMLTableCellElement | null {
  let nextCell: HTMLTableCellElement | null = null;
  switch (direction) {
    case Direction.Up: {
      const prevRow = currentCell.parentElement?.previousElementSibling as HTMLTableRowElement;
      if (prevRow?.hasAttribute("data-row")) {
        nextCell = prevRow.children[currentCell.cellIndex] as HTMLTableCellElement;
      }
      break;
    }
    case Direction.Down: {
      const nextRow = currentCell.parentElement?.nextElementSibling as HTMLTableRowElement;
      if (nextRow?.hasAttribute("data-row")) {
        nextCell = nextRow.children[currentCell.cellIndex] as HTMLTableCellElement;
      }
      break;
    }
    case Direction.Left: {
      const prevSibling = currentCell.previousElementSibling;
      if (prevSibling && (prevSibling.tagName === "TD" || prevSibling.tagName === "TH")) {
        nextCell = prevSibling as HTMLTableCellElement;
      }
      break;
    }
    case Direction.Right: {
      const nextSibling = currentCell.nextElementSibling;
      if (nextSibling && (nextSibling.tagName === "TD" || nextSibling.tagName === "TH")) {
        nextCell = nextSibling as HTMLTableCellElement;
      }
      break;
    }
  }
  return nextCell;
}

export function isAtStartEnd(currentCell: HTMLTableCellElement): {
  isAtStart: boolean;
  isAtEnd: boolean;
} {
  const selection = window.getSelection();
  let isAtStart = false,
    isAtEnd = false;

  if (selection && selection.rangeCount && selection.isCollapsed) {
    const selRange = selection.getRangeAt(0);
    const testRange = selRange.cloneRange();

    testRange.selectNodeContents(currentCell);
    testRange.setEnd(selRange.startContainer, selRange.startOffset);
    isAtStart = testRange.toString() === "";

    testRange.selectNodeContents(currentCell);
    testRange.setStart(selRange.endContainer, selRange.endOffset);
    const endStr = testRange.toString();
    isAtEnd = endStr === "" || endStr === "\n";
  }

  return { isAtStart, isAtEnd };
}

export function navigate(
  currentCell: HTMLTableCellElement,
  event: KeyboardEvent,
  checkboxIndex: number,
  direction?: Direction,
): {
  nextCell: HTMLTableCellElement | null;
  isCheckbox: boolean;
  goToStart?: boolean;
} {
  const cellIndex = currentCell.cellIndex;

  let isAtStart = false,
    isAtEnd = false;
  let bypass = event.altKey || event.key === "Tab" || cellIndex === checkboxIndex;

  if (!bypass) {
    ({ isAtStart, isAtEnd } = isAtStartEnd(currentCell));
  }

  if (!direction) {
    switch (event.key) {
      case "ArrowUp":
        direction = Direction.Up;
        break;
      case "ArrowDown":
        direction = Direction.Down;
        break;
      case "ArrowLeft":
        direction = Direction.Left;
        break;
      case "ArrowRight":
        direction = Direction.Right;
        break;
      case "Tab":
        direction = event.shiftKey ? Direction.Left : Direction.Right;
        break;
      default:
        return { nextCell: null, isCheckbox: false };
    }
  }

  let nextCell: HTMLTableCellElement | null = null;
  let goToStart: boolean | undefined = undefined;
  let isCheckbox = false;

  if (direction == Direction.UpOrDown) {
    let tempNextCell = getCell(currentCell, Direction.Down);
    if (tempNextCell == null) tempNextCell = getCell(currentCell, Direction.Up);
    goToStart = isAtStart || !isAtEnd;
    nextCell = tempNextCell;
  }

  if (isAtEnd || bypass) {
    if (direction == Direction.Down) {
      nextCell = getCell(currentCell, Direction.Down);
      goToStart = false;
    } else if (direction == Direction.Right) {
      nextCell = getCell(currentCell, Direction.Right);
      goToStart = false;
    }
  }

  if (isAtStart || bypass) {
    if (direction == Direction.Up) {
      nextCell = getCell(currentCell, Direction.Up);
      goToStart = true;
    } else if (direction == Direction.Left) {
      nextCell = getCell(currentCell, Direction.Left);
      goToStart = true;
    }
  }

  if (nextCell && nextCell.cellIndex === checkboxIndex && nextCell.tagName === "TD") {
    isCheckbox = true;
  }

  if (event.key === "Tab" || nextCell) {
    event.preventDefault();
  }

  return { nextCell, isCheckbox, goToStart };
}
