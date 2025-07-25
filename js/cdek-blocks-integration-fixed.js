document.addEventListener('DOMContentLoaded', function() {
    
    let isInitialized = false;
    let currentPoints = [];
    let selectedPoint = null;
    let searchTimeout = null;
    
    // Инициализация после загрузки блоков
    function initCdekBlocks() {
        if (isInitialized) return;
        
        const addressInput = getAddressInput();
        if (!addressInput) {
            // Повторяем попытку через 500мс
            setTimeout(initCdekBlocks, 500);
            return;
        }
        
        isInitialized = true;
        console.log('CDEK Blocks Integration initialized');
        
        // Создаем контейнер для пунктов выдачи
        createPickupContainer();
        
        // Автоматический поиск при изменении адреса
        observeAddressChanges();
        
        // Проверяем, есть ли уже адрес
        const existingAddress = getAddressValue();
        if (existingAddress && existingAddress.length > 3) {
            setTimeout(() => searchPickupPoints(existingAddress), 1000);
        }
    }
    
    // Создаем контейнер для пунктов выдачи прямо под полем адреса
    function createPickupContainer() {
        const addressContainer = document.querySelector('.wc-block-components-address-form__address_1');
        if (!addressContainer) return;
        
        // Проверяем, не создан ли уже контейнер
        if (document.getElementById('cdek-blocks-pickup-selection')) return;
        
        const pickupDiv = document.createElement('div');
        pickupDiv.id = 'cdek-blocks-pickup-selection';
        pickupDiv.className = 'cdek-blocks-pickup-selection';
        pickupDiv.innerHTML = `
            <div id="cdek-blocks-points-list"></div>
            <input type="hidden" name="cdek_pickup_point" id="cdek-blocks-pickup-point" value="">
        `;
        
        // Вставляем сразу после поля адреса
        addressContainer.parentNode.insertBefore(pickupDiv, addressContainer.nextSibling);
        
        console.log('CDEK pickup container created');
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
                }, 1000);
            } else {
                clearPointsList();
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
    
    // Показ состояния загрузки
    function showLoading() {
        const pointsList = document.getElementById('cdek-blocks-points-list');
        if (pointsList) {
            pointsList.innerHTML = '<div class="cdek-loading">' + cdek_blocks.messages.searching + '</div>';
        }
    }
    
    // Поиск пунктов выдачи
    function searchPickupPoints(address) {
        console.log('Searching pickup points for:', address);
        
        const pointsList = document.getElementById('cdek-blocks-points-list');
        if (!pointsList) {
            console.error('Points list container not found');
            return;
        }
        
        // Показываем загрузку
        showLoading();
        
        // Выполняем запрос
        fetch(cdek_blocks.rest_url + 'search-points', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-WP-Nonce': cdek_blocks.nonce
            },
            body: JSON.stringify({
                address: address
            })
        })
        .then(response => {
            console.log('Response status:', response.status);
            return response.json();
        })
        .then(data => {
            console.log('Response data:', data);
            
            if (data.code && data.message) {
                // Ошибка API
                throw new Error(data.message);
            }
            
            if (Array.isArray(data)) {
                displayPickupPoints(data);
            } else if (data.data && Array.isArray(data.data)) {
                displayPickupPoints(data.data);
            } else {
                throw new Error('Неверный формат ответа');
            }
        })
        .catch(error => {
            console.error('CDEK Error:', error);
            showError(cdek_blocks.messages.error + ': ' + error.message);
        });
    }
    
    // Отображение пунктов выдачи
    function displayPickupPoints(points) {
        const pointsList = document.getElementById('cdek-blocks-points-list');
        if (!pointsList) return;
        
        currentPoints = points || [];
        console.log('Displaying points:', currentPoints.length);
        
        if (currentPoints.length === 0) {
            showError(cdek_blocks.messages.no_points);
            return;
        }
        
        let html = '<h4 style="margin: 10px 0; color: #333;">Пункты выдачи СДЭК:</h4>';
        
        currentPoints.forEach((point, index) => {
            const workTime = point.work_time ? 
                `<div class="cdek-blocks-point-hours">Режим работы: ${point.work_time}</div>` : '';
            
            const pointName = point.name || 'Пункт выдачи СДЭК';
            const pointAddress = point.location ? point.location.address_full : 'Адрес не указан';
            
            html += `
                <div class="cdek-blocks-point" data-point-code="${point.code}" data-index="${index}">
                    <div class="cdek-blocks-point-name">${pointName}</div>
                    <div class="cdek-blocks-point-address">${pointAddress}</div>
                    ${workTime}
                </div>
            `;
        });
        
        pointsList.innerHTML = html;
        
        // Добавляем обработчики клика
        pointsList.querySelectorAll('.cdek-blocks-point').forEach(pointEl => {
            pointEl.addEventListener('click', function() {
                selectPickupPoint(this);
            });
        });
        
        showSuccess('Найдено пунктов выдачи: ' + currentPoints.length);
    }
    
    // Выбор пункта выдачи
    function selectPickupPoint(pointElement) {
        console.log('Point selected');
        
        // Убираем выделение с других пунктов
        document.querySelectorAll('.cdek-blocks-point').forEach(el => {
            el.classList.remove('selected');
        });
        
        // Выделяем текущий пункт
        pointElement.classList.add('selected');
        
        const pointCode = pointElement.dataset.pointCode;
        const pointIndex = pointElement.dataset.index;
        
        selectedPoint = currentPoints[pointIndex];
        
        // Сохраняем выбранный пункт
        const hiddenInput = document.getElementById('cdek-blocks-pickup-point');
        if (hiddenInput) {
            hiddenInput.value = pointCode;
            console.log('Point saved:', pointCode);
        }
        
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
        
        showSuccess('Выбран пункт выдачи: ' + (selectedPoint.name || 'СДЭК'));
    }
    
    // Очистка выбранного пункта
    function clearSelectedPoint() {
        selectedPoint = null;
        const hiddenInput = document.getElementById('cdek-blocks-pickup-point');
        if (hiddenInput) {
            hiddenInput.value = '';
        }
        
        document.querySelectorAll('.cdek-blocks-point').forEach(el => {
            el.classList.remove('selected');
        });
    }
    
    // Очистка списка пунктов
    function clearPointsList() {
        const pointsList = document.getElementById('cdek-blocks-points-list');
        if (pointsList) {
            pointsList.innerHTML = '';
        }
        currentPoints = [];
    }
    
    // Показ ошибки
    function showError(message) {
        clearMessages();
        const pointsList = document.getElementById('cdek-blocks-points-list');
        if (pointsList) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'cdek-error';
            errorDiv.textContent = message;
            pointsList.appendChild(errorDiv);
        }
    }
    
    // Показ сообщения об успехе
    function showSuccess(message) {
        const existingSuccess = document.querySelector('.cdek-success');
        if (existingSuccess) existingSuccess.remove();
        
        const pointsList = document.getElementById('cdek-blocks-points-list');
        if (pointsList) {
            const successDiv = document.createElement('div');
            successDiv.className = 'cdek-success';
            successDiv.textContent = message;
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
        const pointsList = document.getElementById('cdek-blocks-points-list');
        if (pointsList) {
            pointsList.querySelectorAll('.cdek-error, .cdek-success').forEach(el => {
                el.remove();
            });
        }
    }
    
    // Множественные попытки инициализации
    function tryInitMultipleTimes() {
        let attempts = 0;
        const maxAttempts = 10;
        
        function attemptInit() {
            attempts++;
            console.log('CDEK init attempt:', attempts);
            
            if (getAddressInput()) {
                initCdekBlocks();
                return;
            }
            
            if (attempts < maxAttempts) {
                setTimeout(attemptInit, 1000);
            } else {
                console.error('CDEK: Could not find address input after', maxAttempts, 'attempts');
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
                    setTimeout(initCdekBlocks, 500);
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
            setTimeout(initCdekBlocks, 500);
        });
    }
    
    // Дополнительные попытки при изменении DOM
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.addedNodes.length > 0) {
                // Проверяем, не добавилось ли поле адреса
                for (let node of mutation.addedNodes) {
                    if (node.nodeType === 1) { // Element node
                        if (node.querySelector && node.querySelector('input[autocomplete="address-line1"]')) {
                            setTimeout(initCdekBlocks, 100);
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
    
});