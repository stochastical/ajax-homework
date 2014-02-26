
'use strict'
///////////////////////////////////////////////////
// класс для получения информации о пользователе //
///////////////////////////////////////////////////


	/**
	 * Конструктор класса для получения информации о пользовате
	 * @param {String}   userName Логин пользователя
	 * @param {Function} callback Функция обратного вызова при изменении состояния
	 */
	function GitHubUserInfo(userName, callback) {
		var url;
		this.onProgress = callback;
		this.user = null;
		this.progress = 1;
		this.changeState(9);
															// асинхронная архитектура indexedDB требует 
		this.getUserFromCache( userName, function() {		// введения callback функции
			var callbacksU, callbacksR = {};
			if ( this.user !== null) {
				this.fromCache = true;						// если пользователь из кеша
			} else {
				this.user = { 								// а иначе просто заготовка
					login: userName,
					error: false,
					url : null, 
					followers_url: null 
				};
			}
			if ( (! this.user.date) ||  ( ( Date.now() - this.user.date) > 24 * 60 * 60 * 1000) ) {	// информация новее чем сутки
				url = this.GitHubAPI + '/users/' + userName;
				this.changeState(45);
				callbacksU = { 
					200 : this.parseUser.bind(this),
					404 : this.reportUserNotFound.bind(this),
					0   : this.reportNetError.bind(this),
					403 : this.reportRateLimit.bind(this)
				};
				Object.keys(callbacksU).forEach( function(k) { callbacksR[k] = callbacksU[k]; })
				this.doRequest( url, callbacksU, 5000 );
				url += '/repos';
				callbacksR['200'] = this.parseRepos.bind(this);
				this.doRequest( url, callbacksR, 5000 );
			} else {
				this.changeState(100);
			}
		}.bind(this)
		)
	}

	GitHubUserInfo.prototype.GitHubAPI = 'https://api.github.com'; 
	GitHubUserInfo.prototype.IDBName = 'GitHubUsers';
	GitHubUserInfo.prototype.IDBOStore = 'UserList';

	 /**
	  * Посылает асинхронный GET запрос
	  * @param  {String} url       Адрес для запроса
	  * @param  {Object} callbacks Хеш-таблица содержащая функции обратного вызова для различных ответов сервера
	  * @param  {String} timeout   
	  */
	GitHubUserInfo.prototype.doRequest = function(url, callbacks, timeout) {
		var req = new XMLHttpRequest();
		req.open('GET', url);
		req.onreadystatechange = function() {
			var cback;
			if (this.readyState != 4) return;
			cback = callbacks[this.status];
			if (cback instanceof Function) {
				cback.call(this, this.responseText);
			} else {
				cback = callbacks[0];					// fallback to default callback
				if (cback instanceof Function) {
					cback.call(this, this.responseText);
				}
			}
		}
		if (timeout !== undefined) req.timeout = timeout;
		req.send( );
	}

	
	 /**
	  * Обрабатывает результат запроса информации о пользователе
	  * После обработки посылает запрос о репозиториях пользователя
	  * @param  {String} userData JSON-ответ сервера
	  */
	 GitHubUserInfo.prototype.parseUser = function(userData) {
	 	var userValues, user;
	 	try {
			user = JSON.parse(userData);
			userValues = {
				name: user.name ? user.name : '',
				email: user.email ? user.email : 'Не указан',
				url: user.html_url ? user.html_url : 'https:/github.com/users/' + user.login,
				followers: user.followers ? user.followers : 0,
				followers_url: 'https://github.com/' + user.login + '/followers'
			};
			Object.keys(userValues).forEach( function(key) {
				this.user[key] = userValues[key];
			}, this);

			this.changeState(45);
		} catch (e) {												// Если JSON ответ не распарсился
 			 this.reportNetError();									// то пришли битые данные
		}
	}

	/**
	 * Обработчик события успешного завершения получения информации о пользователе
	 * Добавляет информацию в кеш
	 */
	GitHubUserInfo.prototype.onSuccess = function() {
		if (!this.fromCache) {
			this.user.date = Date.now();
			this.putToCache(this.user);
		}
	}

	/**
	 * Функция устанавливает текущее состояние процесса получения информации о пользователе
	 * Вызывается всеми асинхронными функциями при завершении их части работы
	 * В результате поле this.progress содержит процент выполнения всей работы
	 * Вызывает функции обратного вызова с указаннием текущего состояния
	 * @param  {Number} newProgress 0-100 Доля работы выполненная с предыдущего вызова функции
	 */
	GitHubUserInfo.prototype.changeState = function( newProgress ) {
		var nextState = this.progress + newProgress;
		if ( nextState > 100 ) {
			nextState = 100;
			this.progress = 100;									// сигнализируем о завершении операции
		}
		if (this.onProgress instanceof Function) {
			this.onProgress(this.user, this.progress, nextState-1);
		}
		this.progress = nextState;
		if ( (this.progress === 100) && (! this.user.error) ) {		// при успешном завершении
			this.onSuccess();										// вызываем функцию-обработчик
		}
	}

	/**
	 * Сообщает об ошибке, вызывая callback с установкой 100% завершения операции
	 * @param  {String} message Текст собщения об ошибке
	 */
	GitHubUserInfo.prototype.reportError = function( message) {
		function DaysToString(n) {
			n = Math.floor(n);
			var retval = "" + n;
			if ( (n>5) && (n<21) ) return (retval + " дней");
			n = n % 10;
			if ( (n===1) ) return (retval + " день");
			if ( (n>1) && (n<5) ) return (retval + " дня");
			return (retval + " дней");
		}
		this.user.error = true;
		this.user.msg = message;
		if (this.fromCache)
			this.user.msg += ". Данные использованы из кеша и возможно устарели (последнее обновление "+
				 DaysToString( (Date.now() - this.user.date)/(24*60*60*1000) ) + " назад)";
		this.changeState(100);
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
		var repos, self;
		try {
			repos = JSON.parse(reposData);
			this.user.repos = [];
			repos.forEach(
				function(repo) {
					if (! repo['private'] ) {
						this.user.repos.push( { 
							name:repo.name, 
							url: repo.html_url,
							desc: repo.description
						} );
					}
				}, this	);
			this.changeState(45);
		} catch (e) {												// Если JSON ответ не распарсился
 			this.reportNetError();									// то пришли битые данные
		}
	}

	/**
	 * Получаем данные из кеша
	 * По умолчанию используем indexedDB, иначе откатываемся на localStorage (Opera 12, например)
	 * @param  {String}   username Логин пользователя
	 * @param  {Function} whenReady Callback который вызывается когда работа закончена (данные могут быть и не получены) 
	 */
	GitHubUserInfo.prototype.getUserFromCache = function(username, whenReady) {
		var localItem = null;
		if (window.indexedDB) {								// если есть indexedDB, то используем её
			this.getUserFromIndexedDB(username, whenReady);	
		} else {											// иначе ... 
			localItem = localStorage.getItem( username );	// используем localStorage
			this.user = JSON.parse(localItem);
			if (whenReady instanceof Function)
				setTimeout(whenReady, 1);
		}
	}

	/**
	 * Сохраняем данные в кеш
	 * Аналогично сначала пробуем indexedDB, потом localStorage
	 * @param  {String} username Логин пользователя
	 */
	GitHubUserInfo.prototype.putToCache = function(user) {
		if (window.indexedDB) {
			this.putUserToIndexedDB(user);
		} else {
			localStorage.setItem(user.login, JSON.stringify(user) );
		}
	}

//////////////////////////////////////////////////////////////
// Функции по работе с IndexedDB в прототипе GitHubUserInfo //
//////////////////////////////////////////////////////////////


	/**
	 * Возвращает открыта ли уже необхдимая iDB.
	 * Если нет то запускает асинхронный запрос на открытие базы.
	 * Запускает функции обратного вызова в зависимсти от успеха/ошибки.
	 * Если функция вернула true, то вызывающая функция может получить доступ к дескриптору бд 
	 * 		this.idb (кешируется в прототипе)
	 * @param  {Function} onOpen  Callback, вызываемый в случае успешного открытия базы
	 * @param  {Function} onOther Callback, вызываемый во всех остальных случаях (откат к действию по умолчанию)
	 * @return {Boolean}          Открыта ли уже база данных
	 */
	GitHubUserInfo.prototype.isIDBOpened = function(onOpen, onOther) {
		var dbopen, storeName;
		if (window.indexedDB) {
			if (GitHubUserInfo.prototype.idb instanceof IDBDatabase) { 
				return true;
			}
			if ( (onOpen instanceof Function) ) {
				dbopen = indexedDB.open(this.IDBName, 1);
				storeName = this.IDBOStore; 						// для видимости внутри функций
				if (onOther) dbopen.onerror = onOther;
				dbopen.onupgradeneeded = function( event ) {			// если базы данных не существовало
					var db = event.target.result;
					db.createObjectStore(storeName, { keyPath: 'login' } ); // то создаём хранилище
				}
				dbopen.onsuccess = function( event ) {
					GitHubUserInfo.prototype.idb = event.target.result;			// кешируем соединение с БД в прототипе для всех запросов
					onOpen();
				};
			} else {
				if (onOther) onOther();
			}
		} else {
			if (onOther) onOther();
		}
		return false;
	}

	/**
	 * Получает информацию о пользователе из базы данных
	 * @param  {String} username    Логин пользователя для получения
	 * @param  {Function} whenReady Callback вызываемый при окончании работы (удачном или неудачном)
	 */
	GitHubUserInfo.prototype.getUserFromIndexedDB = function (username, whenReady) {
		var req, tr;
		if (this.isIDBOpened(												// если база уже открыта, то продолжаем работать
				this.getUserFromIndexedDB.bind(this, username, whenReady),	// если нет, то запустить саму себя при удачном открытии базы
				whenReady)) {
			try {															
				req = (tr = this.idb.transaction(this.IDBOStore, 'readonly')).objectStore(this.IDBOStore).get(username);
				tr.onerror = req.onerror = whenReady;
				req.onsuccess = function(event) {
					if ( event.target.result != undefined) 
						this.user = event.target.result;
					whenReady();
				}.bind(this);
			} catch (e) {
				whenReady();
			}
		}
	}

	/**
	 * Сохраняет информацию о пользователе в базу данных
	 * @param  {Object} user Объект с информацией о пользователе
	 */
	GitHubUserInfo.prototype.putUserToIndexedDB = function(user) {
		if (this.isIDBOpened( this.putUserToIndexedDB.bind(this, user) )) { // аналогично, либо продолжаем, либо вызовем саму себя при удачном открытии
			try {
				var tr = this.idb.transaction(this.IDBOStore, 'readwrite');	// никто не ожидает завершения операции
				tr.objectStore(this.IDBOStore).put(user);					// поэтому не ставим обработчики событий
			} catch (e) {};
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
		}, this);
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
		if (info !== null) {
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
				var element = ListOfAttributes[key];
				if (info[key] != undefined) {									// если свойство определено, то 
					element.parentNode.style.display = '';						// показываем поле 
					element.firstChild.textContent = info[key];					// и заполняем значение
				} else {
					element.parentNode.style.display = 'none';					// иначе скрываем поле
				}
			});
			var ListOfHrefs = {													// какие из свойств будут записаны как ссылки
				loginOut : info.url,
				email : info.email ? 'mailto:' + info.email : null,
				followers : info.followers_url
			};
			Object.keys(ListOfHrefs).forEach( function(key) {
					this[key].href = ListOfHrefs[key];					// ссылки 
			}, this);
			this.updateRepoList(info.repos);									// вызываем функцию для вывода списка репозиториев
			if (info.error) {													// если произошла ошибка
				this.errormsg.style.display = '';								// показываем её
				this.errormsg.firstChild.textContent = info.msg;
			} else {
				this.errormsg.style.display = 'none';							// иначе прячем
			}
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
		} else if ( this.pBar.nextState !== undefined) {
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
		if ( (this.loginIn) && (this.loginIn.value.length > 0)) {	// если логин введён, то 
			if (e.preventDefault) 									// отменяем стандартный submit
				e.preventDefault();
			else 
				e.returnValue = false;								// и запрашиваем информацию
			this.user = new GitHubUserInfo( this.loginIn.value, this.updatePage.bind(this) );
		}															// иначе позволим браузеру ругнуться, что поле не заполнено
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



