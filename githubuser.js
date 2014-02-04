

	function GitHubUserInfo(userName, callback) {
		var url, localItem;
		this.onProgress = callback;

		localItem = localStorage.getItem( userName );
		if ( localItem ) {
			this.user = JSON.parse(localItem);
			this.user.fromCache = true;
		} else {
			this.user = { 
				login: userName,
				error: false,
				url : null, 
				followers_url: null 
			};
		}
		if ( (! this.user.date) ||  ( ( Date.now() - this.user.date) > 24 * 60 * 60 * 1000) ) {
			url = this.GitHubAPI + '/users/' + userName;
			this.reportProgress(1, 49);
			this.doRequest(url, { 
				200 : this.parseUser.bind(this),
				404 : this.reportUserNotFound.bind(this),
				0   : this.reportNetError.bind(this),
				403 : this.reportRateLimit.bind(this)
			}, 3000 );
		} else {
			this.reportProgress(100);
		}
		return this.user
	}

	GitHubUserInfo.prototype.GitHubAPI = 'https://192.168.0.3/api.github.com'; //192.168.0.3/

	/*
	 * Посылает асинхронный GET запрос
	 * */
	GitHubUserInfo.prototype.doRequest = function(url, callbacks, timeout) {
		var req = new XMLHttpRequest();
		req.open('GET', url, true);
		req.onreadystatechange = function() {
			var cback;
			if (this.readyState != 4) return;
			callback = callbacks[this.status];
			if (callback instanceof Function) {
				callback.call(this, this.responseText);
			} else {
				callback = callbacks[0];					// fallback to default callback
				if (callback instanceof Function) {
					callback.call(this, this.responseText);
				}
			}
		}
		if (timeout !== undefined) req.timeout = timeout;
		req.send('');
	}

	/*
	 * Асинхронная функция, обрабатывающая результат запроса информациио пользователе
	 * */
	 GitHubUserInfo.prototype.parseUser = function(userData) {
		var user = JSON.parse(userData);
		var userValues = {
			name: user.name ? user.name : '',
			email: user.email ? user.email : 'Не указан',
			url: user.html_url ? user.html_url : 'https:/github.com/users/' + user.login,
			followers: user.followers ? user.followers : 0,
			followers_url: 'https://github.com/' + user.login + '/followers'
		};
		Object.keys(userValues).forEach( function(key) {
			this.user[key] = userValues[key];
		}.bind(this) );

		this.doRequest(user['repos_url'], { 
			200 : this.parseRepos.bind(this),
			0   : this.reportNetError.bind(this),
			403 : this.reportRateLimit.bind(this)
		 }, 3000 );
		this.reportProgress(50, 99);
	}

	GitHubUserInfo.prototype.reportProgress = function( state, nextState ) {
		if (this.onProgress instanceof Function) {
			this.onProgress(this.user, state, nextState);
		}
	}

	GitHubUserInfo.prototype.reportError = function(msgData, message) {
		this.user.error = true;
		this.user.msg = message;
		if (this.user.fromCache)
			this.user.msg += ". Данные выведены из кеша и возможно устарели";
		this.reportProgress(100);
	}

	GitHubUserInfo.prototype.reportUserNotFound = function(msgData) {
		return this.reportError(msgData, 'Указанный пользователь не найден');
	}
	GitHubUserInfo.prototype.reportNetError = function(msgData) {
		return this.reportError(msgData, 'Ошибка получения данных с сервера');
	}
	GitHubUserInfo.prototype.reportRateLimit = function(msgData) {
		return this.reportError(msgData, 'Превышено количество запросов');
	}
	/*
	 * Асинхронная функция, обрабатывающая результат запроса информации о репозиториях пользователя
	 * */
	GitHubUserInfo.prototype.parseRepos = function(reposData) {
		var repos = JSON.parse(reposData);
		var self = this;
		this.user.repos = [];
		repos.forEach(
			function(repo) {
				if (! repo['private'] ) {
					self.user.repos.push( { 
						name:repo.name, 
						url: repo.html_url,
						desc: repo.description
					} );
				}
			}
			);
		this.reportProgress(100);
		this.user.date = Date.now();
		this.user.fromCache = undefined;
		localStorage.setItem(this.user.login, JSON.stringify(this.user) );
	}













	function ViewUpdater() {
		var ListOfElements = {
			loginIn	: 'user_login',
			loginOut: 'login',
			userName: 'user_name',
			email	: 'user_email',
			pBar	: 'progress_bar',
			pBarContainer: 'progress_bar_container',
			followers : 'followers_count',
			reposList : 'repos_list',
			button 	: 'search_button',
			output	: 'output',
			errormsg: 'error_message'
		};
		Object.keys(ListOfElements).forEach( function(key) {
			var el = document.getElementById(ListOfElements[key]);
			if (el instanceof Element) {
				this[key] = el;
			}
		}.bind(this));
		this.setEventListener( this.button, 'click',  this.getUser.bind(this) );
		this.setEventListener( this.pBar, 'transitionend', this.transitionEndListener.bind(this));
	}


	ViewUpdater.prototype.updatePage = function(info, progress, nextState) {
		if ( (this.output.style.display === '') || (this.output.style.display === 'none') ) {
				this.output.style.display = 'block';
		}
		var ListOfAttributes = {
			login: this.loginOut,
			name: this.userName,
			email: this.email,
			followers: this.followers
		};
		Object.keys(ListOfAttributes).forEach( function(key) {
			if (info[key] != undefined) {
				ListOfAttributes[key].parentNode.style.display = '';
				ListOfAttributes[key].firstChild.textContent = info[key];
			} else {
				ListOfAttributes[key].parentNode.style.display = 'none';
			}
		});
		var ListOfHrefs = {
			loginOut : info.url,
			email : info.email ? 'mailto:' + info.email : null,
			followers : info.followers_url
		};
		Object.keys(ListOfHrefs).forEach( function(key) {
				this[key].href = ListOfHrefs[key];
		}.bind(this));
		this.updateRepoList(info.repos);
		if (info.error) {
			this.errormsg.style.display = '';
			this.errormsg.firstChild.textContent = info.msg;
		} else {
			this.errormsg.style.display = 'none';
		}
		this.setProgress(progress, nextState);
	}


	ViewUpdater.prototype.updateRepoList = function(repos) {
		function updateLi(li, repo) {
			li.firstElementChild.firstChild.textContent = repo.name;
			li.firstElementChild.href = repo.url;
			li.title = repo.desc;
		}
		var list, reposList = this.reposList;		// для видимсти внутри функций
		if (repos && repos.length) {
			list = reposList.getElementsByTagName('li');
			repos.slice(0, list.length).forEach( function (repo, idx) { updateLi(list[idx], repo ); });
			Array.prototype.slice.call(list, repos.length).forEach(function(elem){
				reposList.removeChild(elem);
			});
			repos.slice(list.length).forEach( function(repo) {
				var li, a;
				reposList.appendChild( li = document.createElement('li') );
				li.appendChild( a = document.createElement('a') );
				a.appendChild( document.createTextNode('') );
				updateLi(li, repo);
			});
			this.reposList.style.display = 'block';
		} else {
			this.reposList.style.display = 'none';
		}
	}


	ViewUpdater.prototype.transitionEndListener = function() {
		if ( parseInt(this.pBar.style.width) === 100 ) {
			this.setProgress(0);
		}
		if ( this.pBar.nextState !== undefined) {
			this.pBar.style.transitionDuration='3.0s';
			this.pBar.style.width = (this.pBar.nextState)+'%';
		}
		this.pBar.inTransition = false;
	}

	ViewUpdater.prototype.setProgress = function(progress, nextState) {
		if ( (progress>0) ) { // &&  (progress<100)
			if ( (this.pBarContainer.style.display === 'none') || (this.pBarContainer.style.display === '') ) {
				this.pBarContainer.style.display = 'block';
				setTimeout(this.setProgress.bind(this, progress, nextState), 1);
				return ;
			}
			this.pBar.style.transitionDuration='0.2s';
			this.pBar.style.width = (progress)+'%';
			this.pBar.nextState = nextState;
		} else {
			this.pBar.inTransition = false;
			this.pBar.style.width = '0%';
			this.pBar.style.transitionDuration='3.0s';
			this.pBarContainer.style.display = 'none';
			this.button.firstChild.textContent = 'Найти';
			this.button.disabled = false;
		}
	}


	ViewUpdater.prototype.getUser = function(e) {
		e = e || window.event;
		if (e.preventDefault) 
			e.preventDefault();
		else 
			e.returnValue = false;

		if (this.loginIn) {
			this.button.firstChild.textContent = 'Идёт поиск...';
			this.button.disabled = true;
			
			this.user = new GitHubUserInfo( this.loginIn.value, this.updatePage.bind(this) );
		}
	}

	/**
	 * Прикрепляет обработчик события к объекту
	 * @param {HTMLElement} obj объект
	 * @param {String} eventName Имя события
	 * @param {Function} handler Обработчик события
	 * @Private
	 */
	ViewUpdater.prototype.setEventListener = function(obj, eventName, handler) {
		if (! obj) return null;
		if (obj.addEventListener) obj.addEventListener(eventName, handler, false);
		if (obj.attachEvent) obj.attachEvent("on"+eventName, handler);
	}

	ViewUpdater.prototype.unsetEventListener = function(obj, eventName, handler) {
		if (! obj) return null;
		if (obj.removeEventListener) obj.removeEventListener(eventName, handler, false);
		if (obj.detachEvent) obj.detachEvent("on"+eventName, handler);
	}


	ViewUpdater.prototype.setEventListener( window, 'load', function() {new ViewUpdater()});



