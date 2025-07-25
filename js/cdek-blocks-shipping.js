document.addEventListener('DOMContentLoaded', function() {
    
    let isInitialized = false;
    let currentPoints = [];
    let selectedPoint = null;
    let searchTimeout = null;
    
    // Инициализация после загрузки блоков
    function initCdekShipping() {
        if (isInitialized) return;
        
        const addressInput = getAddressInput();
        const shippingContainer = getShippingContainer();
        
        if (!addressInput || !shippingContainer) {
            // Повторяем попытку через 500мс
            setTimeout(initCdekShipping, 500);
            return;
        }
        
        isInitialized = true;
        console.log('CDEK Shipping Integration initialized');
        
        // Автоматический поиск при изменении адреса
        observeAddressChanges();
        
        // Проверяем, есть ли уже адрес
        const existingAddress = getAddressValue();
        if (existingAddress && existingAddress.length > 3) {
            setTimeout(() => searchPickupPoints(existingAddress), 1000);
        }
    }
    
    // Получение поля ввода адреса
    function getAddressInput() {
        // Пробуем разные селекторы
        const selectors = [
            '#shipping-address_1',
            '.wc-block-components-address-form__address_1 input',
            'input[id*="address_1"]',
            'input[autocomplete="address-line1"]'
        ];
        
        for (let selector of selectors) {
            const input = document.querySelector(selector);
            if (input) {
                console.log('Found address input:', selector);
                return input;
            }
        }
        
        return null;
    }
    
    // Получение контейнера доставки
    function getShippingContainer() {
        return document.getElementById('cdek-shipping-container') || 
               document.getElementById('cdek-blocks-pickup-container');
    }
    
    // Получение значения адреса
    function getAddressValue() {
        const input = getAddressInput();
        return input ? input.value.trim() : '';
    }
    
    // Наблюдение за изменениями адреса
    function observeAddressChanges() {
        const addressInput = getAddressInput();
        if (!addressInput) return;
        
        // Обработчик ввода
        addressInput.addEventListener('input', function() {
            clearSelectedPoint();
            clearTimeout(searchTimeout);
            
            const address = this.value.trim();
            console.log('Address changed:', address);
            
            if (address.length > 3) {
                // Показываем состояние загрузки
                showLoading();
                
                // Запускаем поиск с задержкой
                searchTimeout = setTimeout(() => {
                    searchPickupPoints(address);
                }, 1500);
            } else {
                clearPointsList();
                showAddressNote();
            }
        });
        
        // Обработчик потери фокуса
        addressInput.addEventListener('blur', function() {
            const address = this.value.trim();
            if (address.length > 3 && currentPoints.length === 0) {
                setTimeout(() => {
                    searchPickupPoints(address);
                }, 300);
            }
        });
        
        console.log('Address change listeners attached');
    }
    
    // Показ сообщения о необходимости ввода адреса
    function showAddressNote() {
        const pointsList = getPointsList();
        if (pointsList) {
            pointsList.innerHTML = '<div class="cdek-address-note">Пункты выдачи будут показаны после ввода адреса</div>';
        }
    }
    
    // Получение списка пунктов
    function getPointsList() {
        return document.getElementById('cdek-blocks-points-list') ||
               document.getElementById('cdek-points-list');
    }
    
    // Получение скрытого поля
    function getHiddenInput() {
        return document.getElementById('cdek-blocks-pickup-point') ||
               document.getElementById('cdek-pickup-point');
    }
    
    // Показ состояния загрузки
    function showLoading() {
        const pointsList = getPointsList();
        if (pointsList) {
            pointsList.innerHTML = '<div class="cdek-loading">🔍 ' + (cdek_blocks ? cdek_blocks.messages.searching : 'Поиск пунктов выдачи...') + '</div>';
        }
    }
    
    // Поиск пунктов выдачи
    function searchPickupPoints(address) {
        console.log('Searching pickup points for:', address);
        
        const pointsList = getPointsList();
        if (!pointsList) {
            console.error('Points list container not found');
            return;
        }
        
        // Показываем загрузку
        showLoading();
        
        // Определяем URL и метод
        let url, options;
        
        if (window.cdek_blocks && cdek_blocks.rest_url) {
            // Используем REST API для блоков
            url = cdek_blocks.rest_url + 'search-points';
            options = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-WP-Nonce': cdek_blocks.nonce
                },
                body: JSON.stringify({
                    address: address
                })
            };
        } else if (window.cdek_ajax) {
            // Используем AJAX для классической версии
            const formData = new FormData();
            formData.append('action', 'cdek_search_points');
            formData.append('address', address);
            formData.append('nonce', cdek_ajax.nonce);
            
            url = cdek_ajax.ajax_url;
            options = {
                method: 'POST',
                body: formData
            };
        } else {
            showError('Конфигурация не найдена');
            return;
        }
        
        // Выполняем запрос
        fetch(url, options)
        .then(response => {
            console.log('Response status:', response.status);
            return response.json();
        })
        .then(data => {
            console.log('Response data:', data);
            
            // Обработка ответа в зависимости от типа
            let points = null;
            
            if (data.success !== undefined) {
                // AJAX ответ
                if (data.success) {
                    points = data.data;
                } else {
                    throw new Error(data.data || 'Ошибка AJAX');
                }
            } else if (data.code && data.message) {
                // REST API ошибка
                throw new Error(data.message);
            } else if (Array.isArray(data)) {
                // REST API успех
                points = data;
            } else {
                throw new Error('Неверный формат ответа');
            }
            
            displayPickupPoints(points);
        })
        .catch(error => {
            console.error('CDEK Error:', error);
            showError('Ошибка поиска: ' + error.message);
        });
    }
    
    // Отображение пунктов выдачи
    function displayPickupPoints(points) {
        const pointsList = getPointsList();
        if (!pointsList) return;
        
        currentPoints = points || [];
        console.log('Displaying points:', currentPoints.length);
        
        if (currentPoints.length === 0) {
            showError('Пункты выдачи не найдены для указанного адреса');
            return;
        }
        
        let html = '<h4 style="margin: 10px 0; color: #007cba;">📍 Найдено пунктов: ' + currentPoints.length + '</h4>';
        
        currentPoints.forEach((point, index) => {
            const workTime = point.work_time ? 
                `<div class="cdek-point-hours">⏰ ${point.work_time}</div>` : '';
            
            const pointName = point.name || 'Пункт выдачи СДЭК';
            const pointAddress = point.location ? point.location.address_full : 'Адрес не указан';
            
            html += `
                <div class="cdek-point" data-point-code="${point.code}" data-index="${index}">
                    <div class="cdek-point-name">📦 ${pointName}</div>
                    <div class="cdek-point-address">📍 ${pointAddress}</div>
                    ${workTime}
                </div>
            `;
        });
        
        pointsList.innerHTML = html;
        
        // Добавляем обработчики клика
        pointsList.querySelectorAll('.cdek-point').forEach(pointEl => {
            pointEl.addEventListener('click', function() {
                selectPickupPoint(this);
            });
        });
        
        showSuccess('✅ Выберите подходящий пункт выдачи');
    }
    
    // Выбор пункта выдачи
    function selectPickupPoint(pointElement) {
        console.log('Point selected');
        
        // Убираем выделение с других пунктов
        document.querySelectorAll('.cdek-point').forEach(el => {
            el.classList.remove('selected');
        });
        
        // Выделяем текущий пункт
        pointElement.classList.add('selected');
        
        const pointCode = pointElement.dataset.pointCode;
        const pointIndex = pointElement.dataset.index;
        
        selectedPoint = currentPoints[pointIndex];
        
        // Сохраняем выбранный пункт
        const hiddenInput = getHiddenInput();
        if (hiddenInput) {
            hiddenInput.value = pointCode;
            console.log('Point saved:', pointCode);
        }
        
        // Создаем custom event для уведомления о выборе
        const event = new CustomEvent('cdekPointSelected', {
            detail: {
                pointCode: pointCode,
                point: selectedPoint
            }
        });
        document.dispatchEvent(event);
        
        // Триггерим обновление checkout (если доступно)
        if (window.wp && window.wp.data) {
            // Для новых блоков
            try {
                const { dispatch } = window.wp.data;
                dispatch('wc/store/checkout').invalidateResolutionForStore();
            } catch (e) {
                console.log('Could not trigger checkout update via blocks API');
            }
        }
        
        // Альтернативный способ для старых версий
        if (window.jQuery) {
            window.jQuery('body').trigger('update_checkout');
        }
        
        showSuccess('✅ Выбран: ' + (selectedPoint.name || 'Пункт выдачи СДЭК'));
    }
    
    // Очистка выбранного пункта
    function clearSelectedPoint() {
        selectedPoint = null;
        const hiddenInput = getHiddenInput();
        if (hiddenInput) {
            hiddenInput.value = '';
        }
        
        document.querySelectorAll('.cdek-point').forEach(el => {
            el.classList.remove('selected');
        });
    }
    
    // Очистка списка пунктов
    function clearPointsList() {
        const pointsList = getPointsList();
        if (pointsList) {
            pointsList.innerHTML = '';
        }
        currentPoints = [];
    }
    
    // Показ ошибки
    function showError(message) {
        clearMessages();
        const pointsList = getPointsList();
        if (pointsList) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'cdek-error';
            errorDiv.innerHTML = '❌ ' + message;
            pointsList.appendChild(errorDiv);
        }
    }
    
    // Показ сообщения об успехе
    function showSuccess(message) {
        const existingSuccess = document.querySelector('.cdek-success');
        if (existingSuccess) existingSuccess.remove();
        
        const pointsList = getPointsList();
        if (pointsList) {
            const successDiv = document.createElement('div');
            successDiv.className = 'cdek-success';
            successDiv.innerHTML = message;
            pointsList.appendChild(successDiv);
            
            // Автоматически скрываем через 3 секунды
            setTimeout(() => {
                if (successDiv.parentNode) {
                    successDiv.remove();
                }
            }, 3000);
        }
    }
    
    // Очистка сообщений
    function clearMessages() {
        const pointsList = getPointsList();
        if (pointsList) {
            pointsList.querySelectorAll('.cdek-error, .cdek-success').forEach(el => {
                el.remove();
            });
        }
    }
    
    // Множественные попытки инициализации
    function tryInitMultipleTimes() {
        let attempts = 0;
        const maxAttempts = 15;
        
        function attemptInit() {
            attempts++;
            console.log('CDEK shipping init attempt:', attempts);
            
            if (getAddressInput() && getShippingContainer()) {
                initCdekShipping();
                return;
            }
            
            if (attempts < maxAttempts) {
                setTimeout(attemptInit, 1000);
            } else {
                console.error('CDEK: Could not initialize after', maxAttempts, 'attempts');
            }
        }
        
        attemptInit();
    }
    
    // Запускаем инициализацию
    tryInitMultipleTimes();
    
    // Дополнительно пробуем инициализацию при различных событиях
    if (window.wp && window.wp.data) {
        // Для блоков WooCommerce
        try {
            const unsubscribe = window.wp.data.subscribe(() => {
                const isCheckoutDataLoaded = window.wp.data.select('wc/store/checkout').hasFinishedResolution('getCheckoutData');
                if (isCheckoutDataLoaded) {
                    setTimeout(initCdekShipping, 500);
                    unsubscribe();
                }
            });
        } catch (e) {
            console.log('WP data subscribe failed:', e);
        }
    }
    
    // Для совместимости с jQuery
    if (window.jQuery) {
        window.jQuery(document).on('updated_checkout', function() {
            setTimeout(initCdekShipping, 500);
        });
    }
    
    // Дополнительные попытки при изменении DOM
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.addedNodes.length > 0) {
                // Проверяем, не добавился ли контейнер доставки
                for (let node of mutation.addedNodes) {
                    if (node.nodeType === 1) { // Element node
                        if (node.querySelector && (
                            node.querySelector('.wc-block-checkout__shipping-option') ||
                            node.querySelector('#cdek-shipping-container') ||
                            node.querySelector('input[autocomplete="address-line1"]')
                        )) {
                            setTimeout(initCdekShipping, 100);
                            break;
                        }
                    }
                }
            }
        });
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    
    // Показываем начальное сообщение
    setTimeout(() => {
        if (!isInitialized) {
            showAddressNote();
        }
    }, 2000);
    
});