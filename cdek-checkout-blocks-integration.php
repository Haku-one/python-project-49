<?php
/**
 * СДЭК интеграция для WooCommerce блоков checkout
 * Дополнительный файл для работы с новым интерфейсом checkout
 */

// Предотвращаем прямое обращение к файлу
if (!defined('ABSPATH')) {
    exit;
}

class CDEK_Checkout_Blocks_Integration {
    
    public function __construct() {
        add_action('init', array($this, 'init'));
    }
    
    public function init() {
        // Для новых блоков checkout
        add_action('woocommerce_blocks_checkout_block_registration', array($this, 'register_checkout_blocks'));
        
        // Скрытие полей через CSS для блоков
        add_action('wp_head', array($this, 'hide_checkout_fields_css'));
        
        // JavaScript для работы с блоками
        add_action('wp_enqueue_scripts', array($this, 'enqueue_blocks_scripts'));
        
        // REST API endpoint для поиска пунктов выдачи
        add_action('rest_api_init', array($this, 'register_rest_routes'));
    }
    
    /**
     * Скрытие ненужных полей через CSS для блоков checkout
     */
    public function hide_checkout_fields_css() {
        if (is_checkout()) {
            ?>
            <style>
            /* Скрываем ненужные поля в блоках checkout */
            .wc-block-components-address-form__city,
            .wc-block-components-address-form__state,
            .wc-block-components-address-form__postcode {
                display: none !important;
            }
            
            /* Стили для пунктов выдачи СДЭК в блоках */
            .cdek-blocks-pickup-selection {
                margin: 20px 0;
                padding: 15px;
                border: 1px solid #ddd;
                border-radius: 5px;
                background: #f9f9f9;
            }
            
            .cdek-blocks-point {
                border: 1px solid #ccc;
                padding: 12px;
                margin: 8px 0;
                border-radius: 4px;
                background: white;
                cursor: pointer;
                transition: all 0.3s ease;
            }
            
            .cdek-blocks-point:hover {
                background: #f0f0f0;
                border-color: #999;
            }
            
            .cdek-blocks-point.selected {
                border-color: #007cba;
                background: #e7f3ff;
                box-shadow: 0 0 5px rgba(0, 124, 186, 0.3);
            }
            
            .cdek-blocks-point-name {
                font-weight: bold;
                margin-bottom: 6px;
                color: #333;
            }
            
            .cdek-blocks-point-address {
                color: #666;
                font-size: 0.9em;
                line-height: 1.4;
            }
            
            .cdek-blocks-point-hours {
                color: #888;
                font-size: 0.85em;
                margin-top: 6px;
                font-style: italic;
            }
            
            .cdek-search-button {
                background: #007cba;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                transition: background 0.3s ease;
            }
            
            .cdek-search-button:hover {
                background: #005a87;
            }
            
            .cdek-search-button:disabled {
                background: #ccc;
                cursor: not-allowed;
            }
            
            .cdek-loading {
                display: inline-block;
                margin-left: 10px;
            }
            
            .cdek-error {
                color: #d63384;
                margin-top: 10px;
                padding: 8px;
                background: #f8d7da;
                border: 1px solid #f5c6cb;
                border-radius: 4px;
            }
            
            .cdek-success {
                color: #0f5132;
                margin-top: 10px;
                padding: 8px;
                background: #d1e7dd;
                border: 1px solid #badbcc;
                border-radius: 4px;
            }
            </style>
            <?php
        }
    }
    
    /**
     * Подключение скриптов для блоков
     */
    public function enqueue_blocks_scripts() {
        if (is_checkout()) {
            wp_enqueue_script(
                'cdek-blocks-integration',
                get_template_directory_uri() . '/js/cdek-blocks-integration.js',
                array('jquery'),
                '1.0',
                true
            );
            
            wp_localize_script('cdek-blocks-integration', 'cdek_blocks', array(
                'rest_url' => rest_url('cdek/v1/'),
                'nonce' => wp_create_nonce('wp_rest'),
                'messages' => array(
                    'search_button' => 'Найти пункты выдачи',
                    'searching' => 'Поиск...',
                    'no_address' => 'Пожалуйста, введите адрес для поиска пунктов выдачи',
                    'no_points' => 'Пункты выдачи не найдены для указанного адреса',
                    'error' => 'Произошла ошибка при поиске пунктов выдачи',
                    'select_point' => 'Выберите пункт выдачи СДЭК'
                )
            ));
        }
    }
    
    /**
     * Регистрация REST API маршрутов
     */
    public function register_rest_routes() {
        register_rest_route('cdek/v1', '/search-points', array(
            'methods' => 'POST',
            'callback' => array($this, 'rest_search_points'),
            'permission_callback' => '__return_true',
            'args' => array(
                'address' => array(
                    'required' => true,
                    'sanitize_callback' => 'sanitize_text_field',
                ),
            ),
        ));
    }
    
    /**
     * REST API callback для поиска пунктов выдачи
     */
    public function rest_search_points($request) {
        $address = $request->get_param('address');
        
        if (empty($address)) {
            return new WP_Error('no_address', 'Адрес не указан', array('status' => 400));
        }
        
        // Используем основной класс интеграции
        $cdek_integration = new CDEK_WooCommerce_Integration();
        
        // Извлекаем город из адреса
        $city = $this->extract_city_from_address($address);
        
        if (!$city) {
            return new WP_Error('no_city', 'Не удалось определить город из адреса', array('status' => 400));
        }
        
        $points = $cdek_integration->search_pickup_points($city);
        
        if ($points === false) {
            return new WP_Error('search_failed', 'Не удалось найти пункты выдачи', array('status' => 500));
        }
        
        return rest_ensure_response($points);
    }
    
    /**
     * Извлечение города из адреса
     */
    private function extract_city_from_address($address) {
        // Улучшенная логика извлечения города
        $address = trim($address);
        
        // Удаляем лишние пробелы
        $address = preg_replace('/\s+/', ' ', $address);
        
        // Ищем город в начале адреса (до первой запятой)
        $parts = explode(',', $address);
        if (count($parts) > 0) {
            $city_part = trim($parts[0]);
            
            // Удаляем сокращения типа "г.", "город" и т.д.
            $city_part = preg_replace('/^(г\.|город|гор\.?)\s*/i', '', $city_part);
            
            return $city_part;
        }
        
        // Если запятых нет, берем первое слово
        $words = explode(' ', $address);
        if (count($words) > 0) {
            $first_word = trim($words[0]);
            $first_word = preg_replace('/^(г\.|город|гор\.?)\s*/i', '', $first_word);
            return $first_word;
        }
        
        return false;
    }
}

// Инициализируем интеграцию для блоков
new CDEK_Checkout_Blocks_Integration();

/**
 * Функция для добавления пунктов выдачи в checkout блоки
 */
function cdek_add_pickup_to_checkout_blocks() {
    ?>
    <div id="cdek-blocks-pickup-selection" class="cdek-blocks-pickup-selection" style="display: none;">
        <h3>Выберите пункт выдачи СДЭК</h3>
        <button type="button" id="cdek-blocks-search-button" class="cdek-search-button">
            Найти пункты выдачи
        </button>
        <div id="cdek-blocks-points-list"></div>
        <input type="hidden" name="cdek_pickup_point" id="cdek-blocks-pickup-point" value="">
    </div>
    
    <script>
    // Добавляем элемент после загрузки DOM
    document.addEventListener('DOMContentLoaded', function() {
        // Ждем загрузки блоков checkout
        setTimeout(function() {
            var shippingBlock = document.querySelector('.wc-block-components-address-form');
            var pickupElement = document.getElementById('cdek-blocks-pickup-selection');
            
            if (shippingBlock && pickupElement) {
                // Показываем элемент и перемещаем его после формы адреса
                pickupElement.style.display = 'block';
                shippingBlock.parentNode.insertBefore(pickupElement, shippingBlock.nextSibling);
            }
        }, 1000);
    });
    </script>
    <?php
}

// Добавляем в футер на странице checkout
add_action('wp_footer', function() {
    if (is_checkout()) {
        cdek_add_pickup_to_checkout_blocks();
    }
});