export const newGame = () => ({ balance: 1000, rounds: 0, wins: 0, pending: null, history: [] });

export function placePrediction(game, { id, seed, stake, escape, checkpoint, approach, roam }) {
  if (game.pending || !Number.isInteger(stake) || stake < 10 || stake > 100 || stake > game.balance || typeof escape !== 'boolean') {
    throw new Error('Invalid prediction');
  }
  return { ...game, balance: game.balance - stake,
    pending: { id, seed, stake, escape, checkpoint, approach, roam, outcome: null } };
}

export function settlePrediction(game, id, survived) {
  if (!game.pending || game.pending.id !== id) return game;
  const bet = game.pending, won = bet.escape === survived;
  const payout = won ? bet.stake * 2 : 0;
  return { balance: game.balance + payout, rounds: game.rounds + 1, wins: game.wins + Number(won), pending: null,
    history: [...game.history, { id, won, stake: bet.stake, payout, survived }].slice(-20) };
}
