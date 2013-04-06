var socket = io.connect('http://localhost:3000');

socket.on('connect', function() {
  console.log('Connected as', socket.socket.sessionid);
});

var $chat = $('#chat');
function chat(s) {
  $chat.append($('<li>').text(s));
  $chat.scrollTop($chat.get(0).scrollHeight);
}
socket.on('chat', chat);

var $input = $('#input');
$input.on('keypress', function(e) {
  if (e.keyCode == 13) {
    var val = $input.val();
    chat(val);
    socket.emit('input', val);
    $input.val('');
  }
});

var $time = $('#time');
socket.on('time', function(data) {
  $time.text(data);
});

var $word = $('#word');
socket.on('word', function(data) {
  $word.text(data);
});

socket.on('ready', function() {
  $time.add($word).empty();
});

var $online = $('#online span');
socket.on('online', function(data) {
  $online.text(data);
});
