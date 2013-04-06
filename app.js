/**
 * Module dependencies.
 */

var express = require('express')
  , routes = require('./routes')
  , path = require('path')
  , app = express()
  , server = require('http').Server(app)
  , io = require('socket.io').listen(server);

/**
 * Express
 */

app.configure(function(){
  app.set('port', process.env.PORT || 3000);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.favicon());
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.cookieParser('your secret here'));
  app.use(express.session());
  app.use(app.router);
  app.use(require('stylus').middleware(__dirname + '/public'));
  app.use(express.static(path.join(__dirname, 'public')));
});

app.configure('development', function(){
  app.use(express.errorHandler());
});

app.get('/', routes.index);

server.listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});

/**
 * Socket.IO
 */

var online = [], lobby = [];

function emitOnline() {
  io.sockets.emit('online', online.length);
}

function roleMessage(role) {
  return role == 'guess'
    ? 'You need to guess the word before time runs out'
    : 'You can only answer "OO", "HINDI" and "PWEDE"';
}

function gameOverMessage(reason, word) {
  return reason == 'won'
    ? "Good job! " + word + " is right!"
    : "Time's up! Word is " + word;
}

function findGame(data) {
  var socket = this
    , input = data.trim();
  if (/^play$/i.test(input)) {
    remove(lobby, socket.id); // make unique
    lobby.push(socket.id);
    if (lobby.length > 1) {
      newGame(socket, lobby.shift());
      remove(lobby, socket.id);
    } else {
      socket.emit('chat', "Waiting for another player...");
    }
    socket.removeListener('input', findGame);
  }
  // } else if (/^play\s+/i.test(input)) {
  //   var partnerId = input.split(/\s+/)[1];
  // }
}

function newGame(socket, partnerId) {
  var partnerSocket = io.sockets.socket(partnerId)
    , room = io.generateId();

  socket.join(room);
  partnerSocket.join(room);

  var roles = ['guess', 'answer']
    , yourRole = roles.splice(Math.floor(Math.random() * 2), 1).pop()
    , partnerRole = roles.pop();

  socket.set('role', yourRole);
  socket.emit('chat', roleMessage(yourRole));
  partnerSocket.set('role', partnerRole);
  partnerSocket.emit('chat', roleMessage(partnerRole));

  io.sockets.in(room)
    .emit('chat', 'Type READY to start playing or BYE to quit');

  var ready = 0;
  function readyGame(data) {
    if (/ready/i.test(data)) {
      this.removeListener('input', readyGame);
      ready++;
      if (ready > 1) {
        startGame(room);
      } else {
        this.emit('chat', 'Waiting for other player...');
      }
    }
  }

  socket.on('input', readyGame);
  socket.emit('ready');
  partnerSocket.on('input', readyGame);
  partnerSocket.emit('ready');
}

function startGame(room) {
  io.sockets.in(room).emit('chat', 'Starting in...');

  // Start countdown
  function emitCountdown(count) {
    io.sockets.in(room).emit('chat', count + '');
    count--;
    if (count > 0) {
      setTimeout(function() {
        emitCountdown(count);
      }, 1000);
    }
  }
  emitCountdown(5);

  setTimeout(function() {
    var word = 'MANILA';

    // "Game controls"
    function playGame(data) {
      var socket = this;
      socket.get('role', function(err, role) {
        switch (role) {
          case 'guess':
            socket.broadcast.to(room).emit('chat', data);
            if (data.toUpperCase().indexOf(word) > -1) {
              gameOver('won');
            }
            break;
          case 'answer':
            var answer = data.replace(/[^a-z ]+/gi, '').trim();
            if (/^(((oo)|(hind[ie])|(pwede))\s*)+$/i.test(answer)) {
              socket.broadcast.to(room).emit('chat', answer);
            } else {
              socket.emit('chat', '"OO", "HINDI" or "PWEDE" only');
            }
            break;
        }
      });
    }

    io.sockets.clients(room).forEach(function(socket) {
      // Bind "game controls"
      socket.on('input', playGame);
      // Show the "answer-er" the word
      socket.get('role', function(err, role) {
        if (role == 'answer') {
          socket.emit('word', word);
        }
      });
    });

    // Recursive timer
    var stopTimer = false;
    function emitTimer(start) {
      start = start || new Date().getTime();
      var secs = start + 120000 - new Date().getTime()
        , time = pad(Math.floor(secs / 60000), 2) + ':' +
          pad(Math.floor(secs % 60000 / 1000), 2) + ':' + pad(secs % 1000, 3);
      if (stopTimer) {
        return;
      }
      if (secs <= 0) {
        gameOver('timesup');
        time = '00:00:000';
      } else {
        setTimeout(function() {
          emitTimer(start);
        }, 300);
      }
      io.sockets.in(room).emit('time', time);
    }

    function gameOver(reason) {
      // Announce the end
      io.sockets.in(room).emit('chat', gameOverMessage(reason, word));
      io.sockets.in(room)
        .emit('chat', 'Type "PLAY" or "PLAY <ID>" to play again');

      // Stop timer
      stopTimer = 1;

      // Cleanup
      io.sockets.clients(room).forEach(function(socket) {
        socket.removeListener('input', playGame);
        socket.on('input', findGame);
      });
    }

    // Start timer
    emitTimer();

  }, 5000);
}

io.on('connection', function(socket) {

  socket.on('disconnect', function() {
    if (remove(online, socket.id)) {
      emitOnline();
    }
    remove(lobby, socket.id);
  });

  socket.on('input', findGame);

  online.push(socket.id);
  emitOnline();

  socket.emit('chat', 'Welcome to Henyo Ka Ba?!');
  socket.emit('chat', 'Type "PLAY" to play with a random player');
  socket.emit('chat', 'Type "PLAY <ID>" to play with a specific player');
  socket.emit('chat', 'Your ID is "' + socket.id + '"');

});

/**
 * Helpers
 */

function remove(arr, v) {
  var i = arr.lastIndexOf(v);
  if (i >= 0) {
    arr.splice(i, 1);
    return true;
  }
  return false;
}

function pad(n, width, z) {
  z = z || '0';
  n = n + '';
  return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}
