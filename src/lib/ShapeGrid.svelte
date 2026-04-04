<script>
    import { onMount, onDestroy } from "svelte";

    export let direction = "right";
    export let speed = 1;
    export let borderColor = "#999";
    export let squareSize = 40;
    export let hoverFillColor = "#222";
    export let shape = "square";
    export let hoverTrailAmount = 0;
    export let className = "";

    let canvas;
    let ctx;
    let requestId;

    let numSquaresX;
    let numSquaresY;
    let gridOffset = { x: 0, y: 0 };
    let hoveredSquare = null;
    let trailCells = [];
    let cellOpacities = new Map();

    const isHex = () => shape === "hexagon";
    const isTri = () => shape === "triangle";

    let hexHoriz, hexVert;

    function resizeCanvas() {
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
        numSquaresX = Math.ceil(canvas.width / squareSize) + 1;
        numSquaresY = Math.ceil(canvas.height / squareSize) + 1;
    }

    function drawHex(cx, cy, size) {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i;
            const vx = cx + size * Math.cos(angle);
            const vy = cy + size * Math.sin(angle);
            i === 0 ? ctx.moveTo(vx, vy) : ctx.lineTo(vx, vy);
        }
        ctx.closePath();
    }

    function drawCircle(cx, cy, size) {
        ctx.beginPath();
        ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
        ctx.closePath();
    }

    function drawTriangle(cx, cy, size, flip) {
        ctx.beginPath();
        if (flip) {
            ctx.moveTo(cx, cy + size / 2);
            ctx.lineTo(cx + size / 2, cy - size / 2);
            ctx.lineTo(cx - size / 2, cy - size / 2);
        } else {
            ctx.moveTo(cx, cy - size / 2);
            ctx.lineTo(cx + size / 2, cy + size / 2);
            ctx.lineTo(cx - size / 2, cy + size / 2);
        }
        ctx.closePath();
    }

    function drawGrid() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (isHex()) {
            const colShift = Math.floor(gridOffset.x / hexHoriz);
            const offsetX = ((gridOffset.x % hexHoriz) + hexHoriz) % hexHoriz;
            const offsetY = ((gridOffset.y % hexVert) + hexVert) % hexVert;

            const cols = Math.ceil(canvas.width / hexHoriz) + 3;
            const rows = Math.ceil(canvas.height / hexVert) + 3;

            for (let col = -2; col < cols; col++) {
                for (let row = -2; row < rows; row++) {
                    const cx = col * hexHoriz + offsetX;
                    const cy =
                        row * hexVert +
                        ((col + colShift) % 2 !== 0 ? hexVert / 2 : 0) +
                        offsetY;

                    const key = `${col},${row}`;
                    const alpha = cellOpacities.get(key);

                    if (alpha) {
                        ctx.globalAlpha = alpha;
                        drawHex(cx, cy, squareSize);
                        ctx.fillStyle = hoverFillColor;
                        ctx.fill();
                        ctx.globalAlpha = 1;
                    }

                    drawHex(cx, cy, squareSize);
                    ctx.strokeStyle = borderColor;
                    ctx.stroke();
                }
            }
        } else if (isTri()) {
            const halfW = squareSize / 2;
            const colShift = Math.floor(gridOffset.x / halfW);
            const rowShift = Math.floor(gridOffset.y / squareSize);

            const offsetX = ((gridOffset.x % halfW) + halfW) % halfW;
            const offsetY =
                ((gridOffset.y % squareSize) + squareSize) % squareSize;

            const cols = Math.ceil(canvas.width / halfW) + 4;
            const rows = Math.ceil(canvas.height / squareSize) + 4;

            for (let col = -2; col < cols; col++) {
                for (let row = -2; row < rows; row++) {
                    const cx = col * halfW + offsetX;
                    const cy = row * squareSize + squareSize / 2 + offsetY;
                    const flip =
                        (((col + colShift + row + rowShift) % 2) + 2) % 2 !== 0;

                    const key = `${col},${row}`;
                    const alpha = cellOpacities.get(key);

                    if (alpha) {
                        ctx.globalAlpha = alpha;
                        drawTriangle(cx, cy, squareSize, flip);
                        ctx.fillStyle = hoverFillColor;
                        ctx.fill();
                        ctx.globalAlpha = 1;
                    }

                    drawTriangle(cx, cy, squareSize, flip);
                    ctx.strokeStyle = borderColor;
                    ctx.stroke();
                }
            }
        } else if (shape === "circle") {
            const offsetX =
                ((gridOffset.x % squareSize) + squareSize) % squareSize;
            const offsetY =
                ((gridOffset.y % squareSize) + squareSize) % squareSize;

            const cols = Math.ceil(canvas.width / squareSize) + 3;
            const rows = Math.ceil(canvas.height / squareSize) + 3;

            for (let col = -2; col < cols; col++) {
                for (let row = -2; row < rows; row++) {
                    const cx = col * squareSize + squareSize / 2 + offsetX;
                    const cy = row * squareSize + squareSize / 2 + offsetY;

                    const key = `${col},${row}`;
                    const alpha = cellOpacities.get(key);

                    if (alpha) {
                        ctx.globalAlpha = alpha;
                        drawCircle(cx, cy, squareSize);
                        ctx.fillStyle = hoverFillColor;
                        ctx.fill();
                        ctx.globalAlpha = 1;
                    }

                    drawCircle(cx, cy, squareSize);
                    ctx.strokeStyle = borderColor;
                    ctx.stroke();
                }
            }
        } else {
            const offsetX =
                ((gridOffset.x % squareSize) + squareSize) % squareSize;
            const offsetY =
                ((gridOffset.y % squareSize) + squareSize) % squareSize;

            const cols = Math.ceil(canvas.width / squareSize) + 3;
            const rows = Math.ceil(canvas.height / squareSize) + 3;

            for (let col = -2; col < cols; col++) {
                for (let row = -2; row < rows; row++) {
                    const sx = col * squareSize + offsetX;
                    const sy = row * squareSize + offsetY;

                    const key = `${col},${row}`;
                    const alpha = cellOpacities.get(key);

                    if (alpha) {
                        ctx.globalAlpha = alpha;
                        ctx.fillStyle = hoverFillColor;
                        ctx.fillRect(sx, sy, squareSize, squareSize);
                        ctx.globalAlpha = 1;
                    }

                    ctx.strokeStyle = borderColor;
                    ctx.strokeRect(sx, sy, squareSize, squareSize);
                }
            }
        }

        const gradient = ctx.createRadialGradient(
            canvas.width / 2,
            canvas.height / 2,
            0,
            canvas.width / 2,
            canvas.height / 2,
            Math.sqrt(canvas.width ** 2 + canvas.height ** 2) / 2,
        );
        gradient.addColorStop(0, "rgba(0,0,0,0)");

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    function updateCellOpacities() {
        const targets = new Map();

        if (hoveredSquare) {
            targets.set(`${hoveredSquare.x},${hoveredSquare.y}`, 1);
        }

        if (hoverTrailAmount > 0) {
            trailCells.forEach((t, i) => {
                const key = `${t.x},${t.y}`;
                if (!targets.has(key)) {
                    targets.set(
                        key,
                        (trailCells.length - i) / (trailCells.length + 1),
                    );
                }
            });
        }

        for (const key of targets.keys()) {
            if (!cellOpacities.has(key)) cellOpacities.set(key, 0);
        }

        for (const [key, opacity] of cellOpacities.entries()) {
            const target = targets.get(key) || 0;
            const next = opacity + (target - opacity) * 0.15;

            if (next < 0.005) cellOpacities.delete(key);
            else cellOpacities.set(key, next);
        }
    }

    function updateAnimation() {
        const effectiveSpeed = Math.max(speed, 0.1);

        const wrapX = isHex() ? hexHoriz * 2 : squareSize;

        const wrapY = isHex() ? hexVert : isTri() ? squareSize * 2 : squareSize;

        switch (direction) {
            case "right":
                gridOffset.x = (gridOffset.x - effectiveSpeed + wrapX) % wrapX;
                break;
            case "left":
                gridOffset.x = (gridOffset.x + effectiveSpeed + wrapX) % wrapX;
                break;
            case "up":
                gridOffset.y = (gridOffset.y + effectiveSpeed + wrapY) % wrapY;
                break;
            case "down":
                gridOffset.y = (gridOffset.y - effectiveSpeed + wrapY) % wrapY;
                break;
            case "diagonal":
                gridOffset.x = (gridOffset.x - effectiveSpeed + wrapX) % wrapX;
                gridOffset.y = (gridOffset.y - effectiveSpeed + wrapY) % wrapY;
                break;
        }

        updateCellOpacities();
        drawGrid();
        requestId = requestAnimationFrame(updateAnimation);
    }

    function handleMouseMove(e) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        if (isHex()) {
            const colShift = Math.floor(gridOffset.x / hexHoriz);
            const offsetX = ((gridOffset.x % hexHoriz) + hexHoriz) % hexHoriz;
            const offsetY = ((gridOffset.y % hexVert) + hexVert) % hexVert;

            const adjustedX = mouseX - offsetX;
            const adjustedY = mouseY - offsetY;

            const col = Math.round(adjustedX / hexHoriz);
            const rowOffset = (col + colShift) % 2 !== 0 ? hexVert / 2 : 0;
            const row = Math.round((adjustedY - rowOffset) / hexVert);

            updateHover(col, row);
        } else if (isTri()) {
            const halfW = squareSize / 2;

            const offsetX = ((gridOffset.x % halfW) + halfW) % halfW;
            const offsetY =
                ((gridOffset.y % squareSize) + squareSize) % squareSize;

            const col = Math.round((mouseX - offsetX) / halfW);
            const row = Math.floor((mouseY - offsetY) / squareSize);

            updateHover(col, row);
        } else if (shape === "circle") {
            const offsetX =
                ((gridOffset.x % squareSize) + squareSize) % squareSize;
            const offsetY =
                ((gridOffset.y % squareSize) + squareSize) % squareSize;

            const col = Math.round((mouseX - offsetX) / squareSize);
            const row = Math.round((mouseY - offsetY) / squareSize);

            updateHover(col, row);
        } else {
            const offsetX =
                ((gridOffset.x % squareSize) + squareSize) % squareSize;
            const offsetY =
                ((gridOffset.y % squareSize) + squareSize) % squareSize;

            const col = Math.floor((mouseX - offsetX) / squareSize);
            const row = Math.floor((mouseY - offsetY) / squareSize);

            updateHover(col, row);
        }
    }

    function updateHover(col, row) {
        if (
            !hoveredSquare ||
            hoveredSquare.x !== col ||
            hoveredSquare.y !== row
        ) {
            if (hoveredSquare && hoverTrailAmount > 0) {
                trailCells.unshift({ ...hoveredSquare });
                trailCells = trailCells.slice(0, hoverTrailAmount);
            }
            hoveredSquare = { x: col, y: row };
        }
    }

    function handleMouseLeave() {
        if (hoveredSquare && hoverTrailAmount > 0) {
            trailCells.unshift({ ...hoveredSquare });
            trailCells = trailCells.slice(0, hoverTrailAmount);
        }
        hoveredSquare = null;
    }

    onMount(() => {
        ctx = canvas.getContext("2d");

        hexHoriz = squareSize * 1.5;
        hexVert = squareSize * Math.sqrt(3);

        resizeCanvas();
        window.addEventListener("resize", resizeCanvas);

        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseleave", handleMouseLeave);

        requestId = requestAnimationFrame(updateAnimation);
    });

    onDestroy(() => {
        window.removeEventListener("resize", resizeCanvas);
        cancelAnimationFrame(requestId);
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseleave", handleMouseLeave);
    });
</script>

<canvas bind:this={canvas} class={`shapegrid-canvas ${className}`}></canvas>

<style>
    .shapegrid-canvas {
        width: 100%;
        height: 100%;
        border: none;
        display: block;
    }
</style>
