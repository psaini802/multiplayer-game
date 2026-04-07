export default function Board({ board, onMove, currentTurn, mySymbol, winLine, disabled }) {
  return (
    <div className="board">
      {board.map((cell, index) => {
        const isWin = winLine?.includes(index);
        const isDisabled = disabled || !!cell;

        return (
          <button
            key={index}
            className={[
              'cell',
              cell === 'X' ? 'cell-x' : '',
              cell === 'O' ? 'cell-o' : '',
              isWin ? 'cell-win' : ''
            ].filter(Boolean).join(' ')}
            onClick={() => !isDisabled && onMove(index)}
            disabled={isDisabled}
            aria-label={cell ? `${cell} at position ${index + 1}` : `Empty cell ${index + 1}`}
          >
            {cell}
          </button>
        );
      })}
    </div>
  );
}
