(function () {
const { STONE } = window.BadukProblems;

const STONE_MARK_TYPES = {
  triangle: "TR",
  circle: "CR",
  square: "SQ",
  cross: "MA",
};

class BoardController {
  constructor(element, { size, onPlay }) {
    this.element = element;
    this.size = size;
    this.onPlay = onPlay;
    this.stones = [];
    this.answerMarker = null;

    this.board = new WGo.Board(this.element, {
      size: this.size,
      width: this.getResponsiveWidth(),
      section: {
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
      },
    });

    this.board.addEventListener("click", (x, y) => {
      this.onPlay?.({ x, y });
    });

    window.addEventListener("resize", () => this.resize());
  }

  loadPosition(stones) {
    this.stones = [...stones];
    this.answerMarker = null;
    this.render();
  }

  hasStone(point) {
    return this.stones.some((stone) => stone.x === point.x && stone.y === point.y);
  }

  getStoneAt(point) {
    return this.stones.find((stone) => stone.x === point.x && stone.y === point.y);
  }

  addStone(stone) {
    if (this.hasStone(stone)) {
      return false;
    }

    this.stones = [...this.stones, stone];
    this.board.addObject(toWgoStone(stone));
    return true;
  }

  setStones(stones) {
    this.stones = [...stones];
    this.render();
  }

  setAnswerMarker(point) {
    this.answerMarker = point ? { ...point } : null;
    this.render();
  }

  clearAnswerMarker() {
    this.answerMarker = null;
    this.render();
  }

  getStones() {
    return [...this.stones];
  }

  resize() {
    const width = this.getResponsiveWidth();

    if (typeof this.board.setWidth === "function") {
      this.board.setWidth(width);
      return;
    }

    this.render();
  }

  render() {
    this.board.removeAllObjects();
    this.stones.forEach((stone) => {
      this.board.addObject(toWgoStone(stone));
      const mark = toWgoMark(stone);
      if (mark) {
        this.board.addObject(mark);
      }
    });

    if (this.answerMarker) {
      this.board.addObject({
        ...this.answerMarker,
        type: "TR",
      });
    }
  }

  getResponsiveWidth() {
    const fallbackWidth = Math.min(window.innerWidth - 48, 640);
    const measuredWidth = this.element.clientWidth || fallbackWidth;
    return Math.max(260, Math.min(measuredWidth, 640));
  }
}

function toWgoStone(stone) {
  return {
    x: stone.x,
    y: stone.y,
    c: stone.color === STONE.black ? WGo.B : WGo.W,
  };
}

function toWgoMark(stone) {
  const type = STONE_MARK_TYPES[stone.mark];
  if (!type) {
    return null;
  }

  return {
    x: stone.x,
    y: stone.y,
    type,
  };
}

window.BadukBoard = {
  BoardController,
};
})();
