/**
 *
 * yeelight adapter
 *
 *
  */
'use strict';

// you have to require the utils module and call adapter function
var utils =    require(__dirname + '/lib/utils'); // Get common adapter utils
var net = require('net');
var yeelight = require(__dirname + '/lib/yeelight');
var adapter = new utils.Adapter('yeelight');
var objects = {};
var sockets = {};



adapter.on('unload', function (callback) {
    sockets = null;
    yeelight.stopDiscovering();
});

adapter.on('stateChange', function (id, state) {
    var changeState = id.split('.');
    var sid = adapter.namespace + '.' + changeState[2];
    adapter.getState(sid + '.info.IPAdress', function (err, Ip) {
        if (err) {
            adapter.log.error(err);
        } else {
            //adapter.log.warn(JSON.stringify(Ip));
            var host = Ip.val;
            //adapter.log.warn(host);
            if (changeState[3] != 'info') {
                if (!state.ack) {
                    uploadState(sid, host, changeState[3], state.val);
                }
            }
        }


    })
});

adapter.on('ready', function () {
    main();
});

function main() {
    readObjects(createDevice());
    adapter.subscribeStates('*');
    
};

function readObjects(callback) {
    adapter.getForeignObjects(adapter.namespace + ".*", 'channel' , function (err, list) {
        if (err) {
            adapter.log.error(err);
        } else {
            adapter.subscribeStates('*');
            objects = list;
            createSocketsList();
			updateConnect();
            callback && callback();
        }
    });
};
function createDevice() {

    yeelight.discover(function(device) {
        var sid = adapter.namespace  + '.' + device.model + '_' + device.id;
        if (!objects[sid]) {
            adapter.setObject(sid, {
                type: 'channel',
                common: {
                    name: device.model,
                    icon: '/icons/' + device.model + '.png',
                },
                native: {
                    sid: device.id,
                    type: device.model
                }
            });

            adapter.setObject(sid + '.info.connect', {
				common: {
					name: 'Connect',
                    role: 'indicator.connected',
                    write: false,
                    read: true,
                    type: 'boolean'
                },
                type: 'state',
                native: {}
            });
            adapter.setObject(sid + '.info.IPAdress', {
                common: {        
                    name: 'IP',        
                    role: 'state',        
                    write: false,        
                    read: true,        
                    type: 'string'        
                },        
                type: 'state',
                native: {}                
            });            
            adapter.setObject(sid + '.info.Port', {        
                common: {        
                    name: 'Port',        
                    role: 'state',        
                    write: false,        
                    read: true,        
                    type: 'number'        
                },        
                type: 'state',        
                native: {}        
            });
            adapter.setState(sid + '.info.IPAdress', device.host, true);
            adapter.setState(sid + '.info.Port', device.port, true);
            var YeelState = new yeelight;
			YeelState.host = device.host;
			YeelState.port = device.port;
			YeelState.sendCommand('get_prop', ['power', 'active_bright', 'ct', 'rgb', 'active_mode', 'color_mode', 'bright'], function (err, result) {
				if (err) {
					adapter.log.error(err);
				} else {
                    adapter.setState(sid + '.info.connect', true, true);
					if (result) {
						if (result[0]) {
							switch (result[0]) {
								case 'on':
									addState(sid, 'power', true);
									break;
								case 'off':
									addState(sid, 'power', false);
									break;
							}
						}
						if (result[1]) {
							addState(sid, 'active_bright', result[1]);
						} else {
							addState(sid, 'active_bright', result[6]);
						}
						if (result[2]) {
							addState(sid, 'ct', result[2]);
						}
						if (result[3]) {
							addState(sid, 'rgb', result[3]);
						}
						if (result[4]) {
							switch (+result[4]) {
								case 0:
									addState(sid, 'moon_mode', false);
									break;
								case 1:
									addState(sid, 'moon_mode', true);
									break;
							}
						} else {
							if (result[5]) {
								switch (+result[5]) {
									case 1:
										addState(sid, 'color_mode', true);
										break;
									case 2:
										addState(sid, 'color_mode', false);
										break;
								}
							}	
						}	
					} else {
						adapter.log.warn('Нет ответа от устройства по адресу: ' + YeelState.host + ':' + YeelState.port);
					}
				}
			})
			listen(device.host, device.port, setStateDevice);
        };
    });
};
function uploadState(id, host, parameter, val) {
    var device = new yeelight;
    device.host = host;
    device.port = 55443;
    switch (parameter) {

        case 'power':
            var powerState;
            switch (val) {
                case true:
                    powerState = 'on';
                    break;
                case false:
                    powerState = 'off';
                    break;
            }
            device.sendCommand('set_power', [powerState, 'smooth', 1000, 1], function (err, result) {
                if (err) {
                    adapter.log.error(err)
                } else {
                    if (result) {
                        adapter.log.warn(JSON.stringify(result));
                        if (result[0] == 'ok') {
                            //adapter.log.warn('Подтверждение');
                            adapter.setState(id + '.' + parameter, val, true);
                            adapter.getState(id + '.color_mode', function(err, state){
                                if (err) {
                                    adapter.log.error(err)
                                } else {
                                    if (state) {
                                        adapter.setState(id + '.' + '.color_mode', false, true);
                                    }
                                }
                            });
                            if (val) {
                                adapter.setState(id + '.active_bright', getProp(device.host, parameter));
                            }

                        }
                    } else {
                        if (val == getProp (device.host, parameter)) {
                            adapter.setState(id + '.' + parameter, val, true);
                            adapter.getState(id + '.color_mode', function(err, state){
                                if (err) {
                                    adapter.log.error(err)
                                } else {
                                    if (state) {
                                        adapter.setState(id + '.' + '.color_mode', false, true);
                                    }
                                }
                            });
                            if (val) {
                                adapter.setState(id + '.active_bright', getProp(device.host, parameter));
                            }
                        } else {adapter.log.warn('Ошибка подтверждения команды')}
                    }
                }
            })
            break;

        case 'active_bright':
            device.sendCommand('set_bright', [val, 'smooth', 1000], function (err, result) {
                if (err) {
                    adapter.log.error(err)
                } else {
                    if (result) {
                        adapter.log.debug(JSON.stringify(result));
                        if (result[0] == 'ok') {
                            //adapter.log.warn('Подтверждение');
                            adapter.setState(id + '.' + parameter, val, true)
                        }
                    } else {
                        if (val == getProp (device.host, parameter)) {
                            adapter.setState(id + '.' + parameter, val, true);
                        } else {adapter.log.warn('Ошибка подтверждения команды')}
                    }
                }
            })
            break;

        case 'ct':
            device.sendCommand('set_ct_abx', [val, 'smooth', 1000], function (err, result) {
                if (err) {
                    adapter.log.error(err)
                } else {
                    if (result) {
                        adapter.log.debug(JSON.stringify(result));
                        if (result[0] == 'ok') {
                            //adapter.log.warn('Подтверждение');
                            adapter.setState(id + '.' + parameter, val, true)
                        }
                    } else {
                        if (val == getProp (device.host, parameter)) {
                            adapter.setState(id + '.' + parameter, val, true);
                        } else {adapter.log.warn('Ошибка подтверждения команды')}
                    }
                }
            })
            break;

        case 'moon_mode':
            switch (val) {
                case true:
                    device.sendCommand('set_power', ['on', 'smooth', 1000, 5], function (err, result) {
                        if (err) {
                            adapter.log.error(err)
                        } else {
                            if (result) {
                                adapter.log.debug(JSON.stringify(result));
                                if (result[0] == 'ok') {
                                    //adapter.log.warn('Подтверждение');
                                    adapter.setState(id + '.' + parameter, val, true);
                                    adapter.setState(id + '.power', true, true);
                                    adapter.setState(id + '.active_bright', getProp(device.host, parameter));
                                }
                            } else {
                                if (val == getProp (device.host, parameter)) {
                                    adapter.setState(id + '.' + parameter, val, true);
                                    adapter.setState(id + '.power', true, true);
                                    adapter.setState(id + '.active_bright', getProp(device.host, parameter));
                                } else {adapter.log.warn('Ошибка подтверждения команды')}
                            }
                        }
                    })
                    break;
                case false:
                    device.sendCommand('set_power', ['on', 'smooth', 1000, 1], function (err, result) {
                        if (err) {
                            adapter.log.error(err)
                        } else {
                            if (result) {
                                adapter.log.debug(JSON.stringify(result));
                                if (result[0] == 'ok') {
                                    //adapter.log.warn('Подтверждение');
                                    adapter.setState(id + '.' + parameter, val, true);
                                    adapter.setState(id + '.active_bright', getProp(device.host, parameter));
                                }
                            } else {
                                if (val == getProp (device.host, parameter)) {
                                    adapter.setState(id + '.' + parameter, val, true);
                                    adapter.setState(id + '.active_bright', getProp(device.host, parameter));
                                } else {adapter.log.warn('Ошибка подтверждения команды')}
                            }
                        }
                    })
                    break;
            }

            break;

        case 'rgb':
            var rgb = hex2dec(val);
            device.sendCommand('set_power', ['on', 'smooth', 1000, 2], function (err, result) {
                if (err) {
                    adapter.log.error(err)
                } else {
                    if (result) {
                        adapter.log.debug(JSON.stringify(result));
                        if (result[0] == 'ok') {
                            //adapter.log.warn('Подтверждение');
                            adapter.setState(id + '.color_mode', true, true)
                            adapter.setState(id + '.active_bright', getProp(device.host, parameter));
                        }
                    } else {
                        switch (getProp (device.host, 'color_mode')) {
                            case 1:
                                adapter.setState(id + '.color_mode', true, true);
                                adapter.setState(id + '.active_bright', getProp(device.host, parameter));
                                break;
                            case 2:
                                adapter.setState(id + '.color_mode', false, true);
                                adapter.setState(id + '.active_bright', getProp(device.host, parameter));
                                break;
                            default:
                                adapter.log.warn('Ошибка подтверждения команды');
                                break;
                        }
                    }
                }
            });
            device.sendCommand('set_rgb', [+rgb, 'smooth', 1000], function (err, result) {
                if (err) {
                    adapter.log.error(err)
                } else {
                    if (result) {
                        //adapter.log.debug(JSON.stringify(result));
                        if (result[0] == 'ok') {
                            adapter.setState(id + '.' + parameter, val, true)
                        }
                    } else {
                        if (val == getProp (device.host, parameter)) {
                            adapter.setState(id + '.' + parameter, val, true);
                        } else {adapter.log.warn('Ошибка подтверждения команды')}
                    }
                }
            })
            break;
        case 'color_mode':
            switch (val){
                case true:
                    device.sendCommand('set_power', ['on', 'smooth', 1000, 2], function (err, result) {
                        if (err) {
                            adapter.log.error(err)
                        } else {
                            if (result) {
                                //adapter.log.debug(JSON.stringify(result));
                                if (result[0] == 'ok') {
                                    adapter.setState(id + '.' + parameter, val, true)
                                }
                            } else {
                                switch (getProp (device.host, 'color_mode')) {
                                    case 1:
                                        adapter.setState(id + '.' + parameter, true, true);
                                        break;
                                    case 2:
                                        adapter.setState(id + '.' + parameter, false, true);
                                        break;
                                    default:
                                        adapter.log.warn('Ошибка подтверждения команды');
                                        break;
                                }
                            }
                        }
                    })
                    break;
                case false:
                    device.sendCommand('set_power', ['on', 'smooth', 1000, 1], function (err, result) {
                        if (err) {
                            adapter.log.error(err)
                        } else {
                            if (result) {
                                adapter.log.debug(JSON.stringify(result));
                                if (result[0] == 'ok') {
                                    adapter.setState(id + '.' + parameter, val, true);
                                }
                            } else {
                                switch (getProp (device.host, 'color_mode')) {
                                    case 1:
                                        adapter.setState(id + '.' + parameter, true, true);
                                        break;
                                    case 2:
                                        adapter.setState(id + '.' + parameter, false, true);
                                        break;
                                    default:
                                        adapter.log.warn('Ошибка подтверждения команды');
                                        break;
                                }
                            }
                        }
                    });
                    break;
            }
            break;
    }


};
function getProp(host, parameter) {
    var device = new yeelight;
    device.host = host;
    device.port = 55443;
    var param;
    switch (parameter) {
        
        case 'moon_mode':
            param = 'active_mode';
            break;
        default:
            param = parameter;
            break;
    }
    device.sendCommand('get_prop', [param], function (err, result) {
        if (err) {
            adapter.log.error(err)
        } else {
            if (result) {
                return result[0];
            }
        }
    })
}
function dec2hex(dec) {
    return '#' + (+dec).toString(16);
}
function hex2dec(hex) {
    return parseInt(hex.substring(1), 16);
}
function listen(host, port, callback) {
    var socket = net.connect(port, host);
    socket.on('data', function (data) {
		if (callback) {
			try {
				data = JSON.parse(data);
			} catch (e) {
				callback(e);
				return;
			}
			if (data['error']) {
				callback(new Error(data['error']['message']));
			} else {
				callback(socket.remoteAddress, data['params']);
			}
		}
		// socket.destroy();
    });
    socket.on('error', function (err) {
        socket.destroy();
        adapter.log.error(err);
    });
                

}
function setStateDevice(ip, state){
    adapter.log.warn(ip);
    var id = sockets[ip];
    adapter.log.warn(id);
    adapter.log.warn(JSON.stringify(state));
    adapter.log.warn(JSON.stringify(sockets));
    for (var key in state) {
        adapter.log.warn(key);
        switch(key) {
            case 'power':
                switch(state[key]) {
                    case 'on':
                        adapter.setState(id +'.' + key, true, true);
                        break;
                    case 'off':
                        adapter.setState(id +'.' + key, false, true);
                        break;
                }
                break;
			case 'bright':	
            case 'active_bright':
            case 'ct':
                if (key == 'bright') {
					adapter.setState(id +'.active_bright', +state[key], true);
				}
                adapter.setState(id +'.' + key, state[key], true);
                break;
            case 'rgb':
                var value = dec2hex(state[key]);
                adapter.setState(id +'.' + key, value, true);
                break;
            case 'active_mode':
                switch(+state[key]) {
                    case 0:
                        adapter.setState(id + '.moon_mode', false, true);
                        break;
                    case 1:
                        adapter.setState(id + '.moon_mode', true, true);
                        break;
                }
                break;
            case 'color_mode':
                switch(+state[key]) {
                    case 1:
                        adapter.setState(id + '.color_mode', true, true);
                        break;
                    case 2:
                        adapter.setState(id + '.color_mode', false, true);
                        break;
                }
                break;
        }
    }
	
}
function updateConnect () {
	for (var key in objects) {
		var id = key;
		adapter.getState(id + '.info.IPAdress', function (err, Ip) {
			if (err) {
				adapter.log.error(err);
			} else {
                var device = new yeelight;
				device.host = Ip.val;
				device.port = 55443;
				device.sendCommand('get_prop', ['power'], function (err, result) {
					if (err) {
						adapter.log.error(err);
					} else {
						if (result) {
							adapter.setState(id + '.info.connect', true, true);
						} else {
							adapter.setState(id + '.info.connect', false, true);
						}
					}
				})
				listen(Ip.val, 55443, setStateDevice);
			}
		})
	}
}
function addState (id, state, val) {
    switch(state) {
        case 'power':
        case 'moon_mode':
        case 'color_mode':
            adapter.setObject(id + '.' + state, {
                type: 'state',
                common: {
                    name: state,
                    role: 'switch',
                    write: true,
                    read: true,
                    type: 'boolean'
                },
                native: {}
            });
                adapter.setState(id + '.' + state, val, true);
            break;
        case 'ct':
        case 'active_bright':
            adapter.setObject(id + '.' + state, {
                type: 'state',
                common: {
                    name: state,
                    role: 'level.' + state,
                    write: true,
                    read: true,
                    type: 'number'
                },
                native: {}
            });
            adapter.setState(id + '.' + state, val, true);
            break;
        case 'rgb':
            adapter.setObject(id + '.' + state, {
                type: 'state',
                common: {
                    name: state,
                    role: 'level.' + state,
                    write: true,
                    read: true,
                    type: 'string'
                },
                native: {}
            });
            val = dec2hex(val);
            adapter.setState(id + '.' + state, val, true);
            break;
    }

}
function createSocketsList () {
    adapter.getStates(adapter.namespace + '.*.info.IPAdress', function (err, list) {
        if (err) {
            adapter.log.error(err);
        } else {
            var temp = {};
            temp = list;
            for (var key in temp) {
                if (~key.indexOf('IPAdress')) {
                    var id = key;
                    var ip = temp[key].val;
                    var sid = id.split('.');
                    id = sid[0] + '.' + sid[1] + '.' + sid[2];
                    sockets[ip] = id;
                    //adapter.log.warn(JSON.stringify(sockets));
                }
            }
        }
    });

  /*  for (var key in objects) {


      if (key) {

            adapter.getState(key + '.info.IPAdress', function (err, Ip) {
                if (err) {
                    adapter.log.error(err);
                } else {
                    sockets[Ip.val] = key;
                }
            })
        }

    }
  */
}