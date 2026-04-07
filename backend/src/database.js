const Datastore = require('nedb-promises');
const path = require('path');

const dbDir = path.join(__dirname, '../data');

const players = Datastore.create({ filename: path.join(dbDir, 'players.db'), autoload: true });
const games   = Datastore.create({ filename: path.join(dbDir, 'games.db'),   autoload: true });

players.ensureIndex({ fieldName: 'username', unique: true });
games.ensureIndex({ fieldName: 'id', unique: true });

module.exports = { players, games };
