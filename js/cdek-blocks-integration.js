document.addEventListener('DOMContentLoaded', function() {
    
    let isInitialized = false;
    let currentPoints = [];
    let selectedPoint = null;
    
    // Инициализация после загрузки блоков
    function initCdekBlocks() {
        if (isInitialized) return;
        
        const searchButton = document.getElementById('cdek-blocks-search-button');
        const pointsList = document.getElementById('cdek-blocks-points-list');
        const addressInput = document.getElementById('shipping-address_1');
        
        if (!searchButton || !pointsList) {
            // Повторяем попытку через 500мс
            setTimeout(initCdekBlocks, 500);
            return;
        }
        
        isInitialized = true;
        
        // Обработчик кнопки поиска
        searchButton.addEventListener('click', function() {
            const address = getAddressValue();
            
            if (!address) {
                showError(cdek_blocks.messages.no_address);
                return;
            }
            
            searchPickupPoints(address);
        });
        
        // Автоматический поиск при изменении адреса
        observeAddressChanges();
        
        // Проверяем, есть ли уже адрес
        const existingAddress = getAddressValue();
        if (existingAddress && existingAddress.length > 10) {
            setTimeout(() => searchPickupPoints(existingAddress), 1000);
        }
    }
    
    // Получение значения адреса
    function getAddressValue() {
        const addressInput = document.getElementById('shipping-address_1');
        if (addressInput) {
            return addressInput.value.trim();
        }
        
        // Альтернативный поиск в блоках
        const blockAddressInput = document.querySelector('.wc-block-components-address-form__address_1 input');
        if (blockAddressInput) {
            return blockAddressInput.value.trim();
        }
        
        return '';
    }
    
    // Наблюдение за изменениями адреса
    function observeAddressChanges() {
        const addressInputs = [
            document.getElementById('shipping-address_1'),
            document.querySelector('.wc-block-components-address-form__address_1 input')
        ];
        
        addressInputs.forEach(input => {
            if (input) {
                let timeout;
                
                input.addEventListener('input', function() {
                    clearSelectedPoint();
                    clearTimeout(timeout);
                    
                    const address = this.value.trim();
                    if (address.length > 10) {
                        timeout = setTimeout(() => {
                            searchPickupPoints(address);
                        }, 1500);
                    }
                });
                
                input.addEventListener('blur', function() {
                    const address = this.value.trim();
                    if (address.length > 10 && currentPoints.length === 0) {
                        setTimeout(() => {
                            searchPickupPoints(address);
                        }, 500);
                    }
                });
            }
        });
    }
    
    // Поиск пунктов выдачи
    function searchPickupPoints(address) {
        const searchButton = document.getElementById('cdek-blocks-search-button');
        const pointsList = document.getElementById('cdek-blocks-points-list');
        
        if (!searchButton || !pointsList) return;
        
        // Обновляем UI
        searchButton.disabled = true;
        searchButton.textContent = cdek_blocks.messages.searching;
        
        // Очищаем предыдущие результаты
        clearPointsList();
        clearError();
        
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
        .then(response => response.json())
        .then(data => {
            if (data.code && data.message) {
                // Ошибка API
                throw new Error(data.message);
            }
            
            displayPickupPoints(data);
        })
        .catch(error => {
            console.error('CDEK Error:', error);
            showError(cdek_blocks.messages.error + ': ' + error.message);
        })
        .finally(() => {
            // Восстанавливаем кнопку
            searchButton.disabled = false;
            searchButton.textContent = cdek_blocks.messages.search_button;
        });
    }
    
    // Отображение пунктов выдачи
    function displayPickupPoints(points) {
        const pointsList = document.getElementById('cdek-blocks-points-list');
        
        if (!pointsList) return;
        
        currentPoints = points || [];
        
        if (currentPoints.length === 0) {
            showError(cdek_blocks.messages.no_points);
            return;
        }
        
        let html = '<h4>Найденные пункты выдачи:</h4>';
        
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
        clearMessages();
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
    
    // Очистка ошибок
    function clearError() {
        const pointsList = document.getElementById('cdek-blocks-points-list');
        if (pointsList) {
            pointsList.querySelectorAll('.cdek-error').forEach(el => {
                el.remove();
            });
        }
    }
    
    // Запускаем инициализацию
    setTimeout(initCdekBlocks, 1000);
    
    // Дополнительно пробуем инициализацию при различных событиях
    if (window.wp && window.wp.data) {
        // Для блоков WooCommerce
        const unsubscribe = window.wp.data.subscribe(() => {
            const isCheckoutDataLoaded = window.wp.data.select('wc/store/checkout').hasFinishedResolution('getCheckoutData');
            if (isCheckoutDataLoaded) {
                setTimeout(initCdekBlocks, 500);
                unsubscribe();
            }
        });
    }
    
    // Для совместимости с jQuery
    if (window.jQuery) {
        window.jQuery(document).on('updated_checkout', function() {
            setTimeout(initCdekBlocks, 500);
        });
    }
    
});