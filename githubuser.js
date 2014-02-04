

//////////////////////////////////////////////////
// класс для получения информации о пользовате  //
//////////////////////////////////////////////////


	/**
	 * Конструктор класса для получения информации о пользовате
	 * @param {String}   userName Логин пльзователя
	 * @param {Function} callback Функция обратного вызова при изменении состояния
	 * @return {Object}           Информация о пользователе
	 */
	function GitHubUserInfo(userName, callback) {
		var url, localItem;
		this.onProgress = callback;

		localItem = this.getFromCache( userName );		// если пользователь в кеше
		if ( localItem !== null) {
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
		if ( (! this.user.date) ||  ( ( Date.now() - this.user.date) > 24 * 60 * 60 * 1000) ) {	// информация новее чем сутки
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

	GitHubUserInfo.prototype.GitHubAPI = 'https://api.github.com'; //192.168.0.3/

	 /**
	  * Посылает асинхронный GET запрос
	  * @param  {String} url       Адрес для запроса
	  * @param  {String} callbacks Хеш-таблица содержащая функции обратного вызова для различных ответов сервера
	  * @param  {String} timeout   
	  */
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

	
	 /**
	  * Обрабатывает результат запроса информации о пользователе
	  * После обработки посылает запрос о репозиториях пользователя
	  * @param  {String} userData JSON-ответ сервера
	  */
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
			200 : this.parseRepos.bind(this),					// парсим список репозиториев
			0   : this.reportNetError.bind(this),
			403 : this.reportRateLimit.bind(this)
		 }, 3000 );
		this.reportProgress(50, 99);
	}

	/**
	 * Вызывает функцию обратного вызова с указанным состоянием
	 * @param  {Number} state     0-100 Процент завершенности операции
	 * @param  {Number} nextState 0-100 Процент завершенности после следующей операции
	 */
	GitHubUserInfo.prototype.reportProgress = function( state, nextState ) {
		if (this.onProgress instanceof Function) {
			this.onProgress(this.user, state, nextState);
		}
	}

	/**
	 * Сообщает об ошибке, вызывая callback с установкой 100% завершения операции
	 * @param  {String} message Текст собщения об ошибке
	 */
	GitHubUserInfo.prototype.reportError = function( message) {
		this.user.error = true;
		this.user.msg = message;
		if (this.user.fromCache)
			this.user.msg += ". Данные выведены из кеша и возможно устарели";
		this.reportProgress(100);
	}
	/**
	 * Сообщение об ошибке 404 - пользователь не найден
	 */
	GitHubUserInfo.prototype.reportUserNotFound = function() {
		return this.reportError( 'Указанный пользователь не найден' );
	}
	/**
	 * Сообщение об ошибке получения данных по сети
	 */
	GitHubUserInfo.prototype.reportNetError = function() {
		return this.reportError( 'Ошибка получения данных с сервера' );
	}
	/**
	 * Сообщение об ошибке 403 - доступ запрещён, при слишком большом количестве запросов
	 */
	GitHubUserInfo.prototype.reportRateLimit = function() {
		return this.reportError( 'Превышено количество запросов' );
	}
	
	 /**
	  * Обрабатывает результат запроса информации о репозиториях пользователя
	  * После обработки устанавливает процент завершения операции 100%
	  * Сохраняет информацию о пользователе в локальное хранилище
	  * Т.о. в локальное хранилище попадают пользователи обработанные без ошибок
	  * @param  {String} reposData JSON-ответ сервера
	  */
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
		this.setToCache(this.user);
	}


	GitHubUserInfo.prototype.getFromCache = function(username) {
		var localItem = null;
		if (window.localStorage) {
			localItem = localStorage.getItem( username );
		}
		return localItem;
	}


	GitHubUserInfo.prototype.setToCache = function(user) {
		if (window.localStorage) {
			localStorage.setItem(user.login, JSON.stringify(user) );
		}
	}







////////////////////////////////////////////////////////////
// класс для вывода на страницу информации о пользователе //
////////////////////////////////////////////////////////////




	/**
	 * Конструктор класса для вывода информации на страницу
	 * Находит и сохраняет все необходимые элементы на странице
	 * Устанавливает необходимые обработчики событий
	 */
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

	/**
	 * Заполняет все необходимые поля на странице
	 * Передаётся как функция обратного вызова в объект GitHubUserInfo
	 * @param  {Object} info      Объект информации о пользователе
	 * @param  {Number} progress  0-100 Процент завершенности операции
	 * @param  {Number} nextState 0-100 Процент завершенности после следующей операции
	 */
	ViewUpdater.prototype.updatePage = function(info, progress, nextState) {
		if ( (this.output.style.display === '') || (this.output.style.display === 'none') ) {	
				this.output.style.display = 'block';					// делаем видимым поле для вывода информации
		}
		var ListOfAttributes = {						// какие свойства объекта в какие поля на странице записывать
			login: this.loginOut,
			name: this.userName,
			email: this.email,
			followers: this.followers
		};
		Object.keys(ListOfAttributes).forEach( function(key) {
			if (info[key] != undefined) {									// если свойство определено, то 
				ListOfAttributes[key].parentNode.style.display = '';		// показываем поле 
				ListOfAttributes[key].firstChild.textContent = info[key];	// и заполняем значение
			} else {
				ListOfAttributes[key].parentNode.style.display = 'none';	// иначе скрываем поле
			}
		});
		var ListOfHrefs = {													// какие из свойств будут записаны как ссылки
			loginOut : info.url,
			email : info.email ? 'mailto:' + info.email : null,
			followers : info.followers_url
		};
		Object.keys(ListOfHrefs).forEach( function(key) {
				this[key].href = ListOfHrefs[key];					// ссылки 
		}.bind(this));
		this.updateRepoList(info.repos);									// вызываем функцию для вывода списка репозиториев
		if (info.error) {													// если произошла ошибка
			this.errormsg.style.display = '';								// показываем её
			this.errormsg.firstChild.textContent = info.msg;
		} else {
			this.errormsg.style.display = 'none';							// иначе прячем
		}
		this.setProgress(progress, nextState);								// устанавливаем состояние прогресс-бара
	}

	/**
	 * Выводит список репозиториев на страницу
	 * Добавляет/удаляет/изменяет значения элементов списка
	 * @param  {Array} repos Массив объектов-информации о репозиториях
	 */
	ViewUpdater.prototype.updateRepoList = function(repos) {
		/**
		 * Вспомогательная функция для установки значений необхдимых полей у существующего li
		 * @param  {Element} li   Элемент списка куда выводить
		 * @param  {Object}  repo Объект с информацией для вывода
		 */
		function updateLi(li, repo) {
			li.firstElementChild.firstChild.textContent = repo.name;	// имя
			li.firstElementChild.href = repo.url;						// ссылка на проект
			li.title = repo.desc;										// описание во всплывающей подсказке
		}

		var list, root, reposList = this.reposList;		// для видимсти внутри функций
		if (repos && repos.length) {
			list = reposList.getElementsByTagName('li');		// список существующих элементов списка
																// Для существующих элементов просто обновляет их значения
			repos.slice(0, list.length).forEach( function (repo, idx) { updateLi(list[idx], repo ); }); 
																// Лишние элементы удаляем 
			Array.prototype.slice.call(list, repos.length).forEach(function(elem){
				reposList.removeChild(elem);
			});
			if (repos.length > list.length) {				// Если элементов не хватило, то создаём и заполняем
				root = document.createDocumentFragment();	
				repos.slice(list.length).forEach( function(repo) {
					var li, a;
					root.appendChild( li = document.createElement('li') );
					li.appendChild( a = document.createElement('a') );
					a.appendChild( document.createTextNode('') );
					updateLi(li, repo);
				});
				reposList.appendChild(root);
			}
			this.reposList.style.display = 'block';
		} else {
			this.reposList.style.display = 'none';		// если репозиториев нет, то прячем блок с ними
		}
	}

	/**
	 * Обработчик завершения анимации прогресс-бара
	 * Прячет прогресс-бар при постижении 100%
	 */
	ViewUpdater.prototype.transitionEndListener = function() {
		if ( parseInt(this.pBar.style.width) === 100 ) {
			this.setProgress(0);
		}
		if ( this.pBar.nextState !== undefined) {
			this.pBar.style.transitionDuration='3.0s';
			this.pBar.style.width = (this.pBar.nextState)+'%';
		}
	}

	/**
	 * Устанавливает значение прогресс-бара
	 * @param  {Number} progress  0-100 Процент завершенности операции
	 * @param  {Number} nextState 0-100 Процент завершенности после следующей операции
	 */
	ViewUpdater.prototype.setProgress = function(progress, nextState) {
		if ( progress > 100 ) progress = 100;
		if ( (progress>0) ) { 
			if ( (this.pBarContainer.style.display === 'none') || (this.pBarContainer.style.display === '') ) {
				this.pBarContainer.style.display = 'block';						// если прогресс бара не было, то показываем его
				this.button.firstChild.textContent = 'Идёт поиск...';
				this.button.disabled = true;
				setTimeout(this.setProgress.bind(this, progress, nextState), 1); // и вызываем себя асинхронно, иначе анимация(transition) 
				return ;														// не заработает
			}
			this.pBar.style.transitionDuration='0.2s';
			this.pBar.style.width = (progress)+'%';
			this.pBar.nextState = nextState;
		} else {																// прячем прогресс бар
			this.pBar.style.width = '0%';
			this.pBarContainer.style.display = 'none';
			this.button.firstChild.textContent = 'Найти';
			this.button.disabled = false;
		}
	}

	/**
	 * Получает информацию о пльзователе через GitHubUserInfo
	 * Устанавливается как обработчик нажатия кнопки
	 * @param  {Event} e Дескриптор события
	 */
	ViewUpdater.prototype.getUser = function(e) {
		e = e || window.event;
		if ( (this.loginIn) && (this.loginIn.value.length > 0)) {	
			if (e.preventDefault) 
				e.preventDefault();
			else 
				e.returnValue = false;
			this.user = new GitHubUserInfo( this.loginIn.value, this.updatePage.bind(this) );
		}
	}

	/**
	 * Прикрепляет обработчик события к объекту
	 * @param {HTMLElement} obj 	  объект
	 * @param {String} 		eventName Имя события
	 * @param {Function} 	handler   Обработчик события
	 * @Private
	 */
	ViewUpdater.prototype.setEventListener = function(obj, eventName, handler) {
		if (! obj) return null;
		if (obj.addEventListener) obj.addEventListener(eventName, handler, false);
		if (obj.attachEvent) obj.attachEvent("on"+eventName, handler);
	}


	// При загрузке страницы начинаем всю работу с создания нового экземпляра класса ViewUpdater
	 
	ViewUpdater.prototype.setEventListener( window, 'load', function() {new ViewUpdater()});



