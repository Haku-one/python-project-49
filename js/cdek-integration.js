jQuery(document).ready(function($) {
    
    // Поиск пунктов выдачи при клике на кнопку
    $('#search-cdek-points').on('click', function() {
        var address = $('#shipping-address_1').val();
        
        if (!address) {
            alert('Пожалуйста, введите адрес для поиска пунктов выдачи');
            return;
        }
        
        var button = $(this);
        button.prop('disabled', true).text('Поиск...');
        
        $.ajax({
            url: cdek_ajax.ajax_url,
            type: 'POST',
            data: {
                action: 'cdek_search_points',
                address: address,
                nonce: cdek_ajax.nonce
            },
            success: function(response) {
                if (response.success) {
                    displayPickupPoints(response.data);
                } else {
                    alert('Ошибка: ' + response.data);
                }
            },
            error: function() {
                alert('Произошла ошибка при поиске пунктов выдачи');
            },
            complete: function() {
                button.prop('disabled', false).text('Найти пункты выдачи');
            }
        });
    });
    
    // Отображение пунктов выдачи
    function displayPickupPoints(points) {
        var container = $('#cdek-points-list');
        container.empty();
        
        if (!points || points.length === 0) {
            container.html('<p>Пункты выдачи не найдены для указанного адреса</p>');
            return;
        }
        
        var html = '<h4>Найденные пункты выдачи:</h4>';
        
        $.each(points, function(index, point) {
            var workTime = '';
            if (point.work_time) {
                workTime = '<div class="cdek-point-hours">Режим работы: ' + point.work_time + '</div>';
            }
            
            html += '<div class="cdek-point" data-point-code="' + point.code + '">' +
                   '<div class="cdek-point-name">' + (point.name || 'Пункт выдачи СДЭК') + '</div>' +
                   '<div class="cdek-point-address">' + point.location.address_full + '</div>' +
                   workTime +
                   '</div>';
        });
        
        container.html(html);
        
        // Обработчик выбора пункта выдачи
        $('.cdek-point').on('click', function() {
            $('.cdek-point').removeClass('selected');
            $(this).addClass('selected');
            
            var pointCode = $(this).data('point-code');
            $('#cdek_pickup_point').val(pointCode);
            
            // Обновляем расчет доставки
            $('body').trigger('update_checkout');
        });
    }
    
    // Автоматический поиск при изменении адреса
    $('#shipping-address_1').on('blur', function() {
        var address = $(this).val();
        if (address && address.length > 10) {
            // Небольшая задержка перед автоматическим поиском
            setTimeout(function() {
                $('#search-cdek-points').trigger('click');
            }, 500);
        }
    });
    
    // Сброс выбранного пункта при изменении адреса
    $('#shipping-address_1').on('input', function() {
        $('#cdek_pickup_point').val('');
        $('#cdek-points-list').empty();
        $('.cdek-point').removeClass('selected');
    });
    
});