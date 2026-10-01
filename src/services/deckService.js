const axios = require('axios');

const api = axios.create({ baseURL: 'https://deckofcardsapi.com/api/deck', timeout: 8000 });

const fail = () => {
  const err = new Error('El servicio de cartas no responde, intenta de nuevo');
  err.status = 502;
  return err;
};

const newDeck = async () => {
  try {
    const { data } = await api.get('/new/shuffle/?deck_count=6');
    if (!data.success) throw new Error();
    return data.deck_id;
  } catch {
    throw fail();
  }
};

const draw = async (deckId, count) => {
  try {
    const { data } = await api.get(`/${deckId}/draw/?count=${count}`);
    if (!data.success || data.cards.length < count) throw new Error();
    return data.cards.map((c) => ({ code: c.code, value: c.value, suit: c.suit, image: c.image }));
  } catch {
    throw fail();
  }
};

module.exports = { newDeck, draw };