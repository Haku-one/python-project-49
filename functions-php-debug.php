<?php
/**
 * СДЭК Интеграция для WooCommerce - ОТЛАДОЧНАЯ версия
 * Исправление регистрации метода доставки
 */

// Предотвращаем прямое обращение к файлу
if (!defined('ABSPATH')) {
    exit;
}

// Класс метода доставки СДЭК - ОБЯЗАТЕЛЬНО ДО основного класса
if (!class_exists('WC_CDEK_Shipping_Method') && class_exists('WC_Shipping_Method')) {
    class WC_CDEK_Shipping_Method extends WC_Shipping_Method {
        
        public function __construct($instance_id = 0) {
            $this->instance_id = absint($instance_id);
            $this->id = 'cdek_shipping';
            $this->method_title = __('СДЭК Доставка', 'woocommerce');
            $this->method_description = __('Доставка через службу СДЭК до пунктов выдачи', 'woocommerce');
            $this->enabled = 'yes';
            $this->title = 'СДЭК Доставка';
            
            // Поддержка зон доставки
            $this->supports = array(
                'shipping-zones',
                'instance-settings',
                'instance-settings-modal',
            );
            
            error_log('CDEK Shipping Method initialized: ' . $this->id);
            
            $this->init();
        }
        
        public function init() {
            $this->init_form_fields();
            $this->init_settings();
            
            // Сохраняем настройки
            add_action('woocommerce_update_options_shipping_' . $this->id, array($this, 'process_admin_options'));
        }
        
        public function init_form_fields() {
            $this->instance_form_fields = array(
                'enabled' => array(
                    'title' => 'Включить/Отключить',
                    'type' => 'checkbox',
                    'description' => 'Включить метод доставки СДЭК',
                    'default' => 'yes'
                ),
                'title' => array(
                    'title' => 'Название метода',
                    'type' => 'text',
                    'description' => 'Название метода доставки, которое увидят покупатели',
                    'default' => 'СДЭК Доставка'
                ),
                'from_city_code' => array(
                    'title' => 'Код города отправления',
                    'type' => 'text',
                    'description' => 'Код города СДЭК откуда отправляем товары (по умолчанию Саратов - 194)',
                    'default' => '194'
                ),
                'cost' => array(
                    'title' => 'Стоимость',
                    'type' => 'text',
                    'description' => 'Стоимость доставки или оставьте пустым для автоматического расчета через API СДЭК',
                    'default' => '',
                    'desc_tip' => true,
                )
            );
        }
        
        public function calculate_shipping($package = array()) {
            global $cdek_integration_instance;
            
            // Получаем стоимость из настроек или рассчитываем через API
            $cost = $this->get_option('cost');
            
            if (empty($cost) && $cdek_integration_instance) {
                // Рассчитываем через API
                $cost = $cdek_integration_instance->calculate_shipping_cost($package);
            } elseif (!empty($cost)) {
                // Используем фиксированную стоимость
                $cost = floatval($cost);
            } else {
                $cost = 0;
            }
            
            $rate = array(
                'id' => $this->get_rate_id(),
                'label' => $this->title,
                'cost' => $cost,
                'calc_tax' => 'per_item'
            );
            
            $this->add_rate($rate);
        }
        
        public function get_from_city_code() {
            return $this->get_option('from_city_code', '194');
        }
    }
}

// Основной класс интеграции СДЭК
class CDEK_WooCommerce_Integration {
    
    // API данные СДЭК
    private $cdek_account = 'Lr7x5fauu0eOXDA4hlK04HiMUpqHgzzR';
    private $cdek_password = 'fzwKqoaKaTrwRjxVhf6csNzTefyHRHYM';
    private $yandex_api_key = '4020b4d5-1d96-476c-a10e-8ab18f0f3702';
    private $cdek_api_url = 'https://api.cdek.ru/v2/';
    private $cdek_token = null;
    
    public function __construct() {
        add_action('init', array($this, 'init'));
    }
    
    public function init() {
        // Убираем ненужные поля из формы доставки
        add_filter('woocommerce_checkout_fields', array($this, 'remove_checkout_fields'));
        add_filter('woocommerce_shipping_fields', array($this, 'remove_shipping_fields'));
        
        // AJAX для поиска пунктов выдачи
        add_action('wp_ajax_cdek_search_points', array($this, 'ajax_search_points'));
        add_action('wp_ajax_nopriv_cdek_search_points', array($this, 'ajax_search_points'));
        
        // REST API для блоков
        add_action('rest_api_init', array($this, 'register_rest_routes'));
        
        // Подключаем скрипты
        add_action('wp_enqueue_scripts', array($this, 'enqueue_scripts'));
        
        // Добавляем поле выбора пункта выдачи
        add_action('woocommerce_after_shipping_address', array($this, 'add_cdek_pickup_field'));
        
        // Сохраняем данные пункта выдачи
        add_action('woocommerce_checkout_update_order_meta', array($this, 'save_cdek_pickup_data'));
        
        // Скрытие полей через CSS
        add_action('wp_head', array($this, 'hide_checkout_fields_css'));
        
        // Хук для отображения выбранного пункта в админке
        add_action('woocommerce_admin_order_data_after_shipping_address', array($this, 'display_cdek_pickup_in_admin'));
    }
    
    /**
     * Убираем ненужные поля из формы доставки
     */
    public function remove_checkout_fields($fields) {
        unset($fields['shipping']['shipping_city']);
        unset($fields['shipping']['shipping_state']);
        unset($fields['shipping']['shipping_postcode']);
        
        return $fields;
    }
    
    public function remove_shipping_fields($fields) {
        unset($fields['shipping_city']);
        unset($fields['shipping_state']);
        unset($fields['shipping_postcode']);
        
        return $fields;
    }
    
    /**
     * Скрытие полей через CSS
     */
    public function hide_checkout_fields_css() {
        if (is_checkout()) {
            ?>
            <style>
            /* Скрываем ненужные поля */
            .wc-block-components-address-form__city,
            .wc-block-components-address-form__state,
            .wc-block-components-address-form__postcode {
                display: none !important;
            }
            
            /* Стили для пунктов выдачи СДЭК */
            .cdek-pickup-container {
                margin: 15px 0;
                padding: 15px;
                border: 1px solid #ddd;
                border-radius: 5px;
                background: #f9f9f9;
            }
            
            .cdek-shipping-container {
                margin: 20px 0;
                padding: 20px;
                border: 1px solid #007cba;
                border-radius: 8px;
                background: #f8f9fa;
            }
            
            .cdek-shipping-container h3 {
                margin: 0 0 15px 0;
                color: #007cba;
                font-size: 16px;
                font-weight: 600;
            }
            
            .cdek-point {
                border: 1px solid #ccc;
                padding: 12px;
                margin: 8px 0;
                border-radius: 4px;
                background: white;
                cursor: pointer;
                transition: all 0.3s ease;
            }
            
            .cdek-point:hover {
                background: #f0f0f0;
                border-color: #999;
            }
            
            .cdek-point.selected {
                border-color: #007cba;
                background: #e7f3ff;
                box-shadow: 0 0 5px rgba(0, 124, 186, 0.3);
            }
            
            .cdek-point-name {
                font-weight: bold;
                margin-bottom: 6px;
                color: #333;
            }
            
            .cdek-point-address {
                color: #666;
                font-size: 0.9em;
                line-height: 1.4;
            }
            
            .cdek-point-hours {
                color: #888;
                font-size: 0.85em;
                margin-top: 6px;
                font-style: italic;
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
            
            .cdek-loading {
                color: #0069d9;
                font-style: italic;
                padding: 8px;
            }
            
            .cdek-address-note {
                font-size: 0.9em;
                color: #666;
                font-style: italic;
                margin-bottom: 10px;
            }
            </style>
            <?php
        }
    }
    
    /**
     * Подключаем скрипты
     */
    public function enqueue_scripts() {
        if (is_checkout()) {
            // Основной скрипт
            wp_enqueue_script('cdek-integration', get_template_directory_uri() . '/js/cdek-integration.js', array('jquery'), '1.0', true);
            wp_localize_script('cdek-integration', 'cdek_ajax', array(
                'ajax_url' => admin_url('admin-ajax.php'),
                'nonce' => wp_create_nonce('cdek_nonce')
            ));
            
            // Скрипт для блоков
            wp_enqueue_script('cdek-blocks-integration', get_template_directory_uri() . '/js/cdek-blocks-integration.js', array('jquery'), '1.0', true);
            wp_localize_script('cdek-blocks-integration', 'cdek_blocks', array(
                'rest_url' => rest_url('cdek/v1/'),
                'nonce' => wp_create_nonce('wp_rest'),
                'messages' => array(
                    'searching' => 'Поиск пунктов выдачи...',
                    'no_address' => 'Введите адрес для поиска пунктов выдачи',
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
        try {
            $address = $request->get_param('address');
            
            if (empty($address)) {
                return new WP_Error('no_address', 'Адрес не указан', array('status' => 400));
            }
            
            // Извлекаем город из адреса
            $city = $this->extract_city_from_address($address);
            
            if (!$city) {
                return new WP_Error('no_city', 'Не удалось определить город из адреса', array('status' => 400));
            }
            
            $points = $this->search_pickup_points($city);
            
            if ($points === false) {
                return new WP_Error('search_failed', 'Не удалось найти пункты выдачи', array('status' => 500));
            }
            
            return rest_ensure_response($points);
        } catch (Exception $e) {
            error_log('CDEK REST Error: ' . $e->getMessage());
            return new WP_Error('server_error', 'Ошибка сервера: ' . $e->getMessage(), array('status' => 500));
        }
    }
    
    /**
     * Получаем токен для СДЭК API
     */
    private function get_cdek_token() {
        // Проверяем кешированный токен
        $cached_token = get_transient('cdek_token');
        if ($cached_token) {
            $this->cdek_token = $cached_token;
            return $this->cdek_token;
        }
        
        $response = wp_remote_post($this->cdek_api_url . 'oauth/token', array(
            'body' => array(
                'grant_type' => 'client_credentials',
                'client_id' => $this->cdek_account,
                'client_secret' => $this->cdek_password
            ),
            'timeout' => 30
        ));
        
        if (is_wp_error($response)) {
            error_log('CDEK Token Error: ' . $response->get_error_message());
            return false;
        }
        
        $body = json_decode(wp_remote_retrieve_body($response), true);
        
        if (isset($body['access_token'])) {
            $this->cdek_token = $body['access_token'];
            // Кешируем токен на 1 час
            set_transient('cdek_token', $this->cdek_token, 3600);
            return $this->cdek_token;
        }
        
        error_log('CDEK Token Response: ' . wp_remote_retrieve_body($response));
        return false;
    }
    
    /**
     * Получаем координаты города через Яндекс API
     */
    private function get_city_coordinates($city) {
        $cache_key = 'cdek_coords_' . md5($city);
        $coords = get_transient($cache_key);
        
        if ($coords) {
            return $coords;
        }
        
        $url = 'https://geocode-maps.yandex.ru/1.x/?format=json&apikey=' . $this->yandex_api_key . '&geocode=' . urlencode($city);
        
        $response = wp_remote_get($url, array('timeout' => 30));
        
        if (is_wp_error($response)) {
            error_log('Yandex API Error: ' . $response->get_error_message());
            return false;
        }
        
        $body = json_decode(wp_remote_retrieve_body($response), true);
        
        if (isset($body['response']['GeoObjectCollection']['featureMember'][0])) {
            $coordinates = $body['response']['GeoObjectCollection']['featureMember'][0]['GeoObject']['Point']['pos'];
            $coords_array = explode(' ', $coordinates);
            
            $coords = array(
                'longitude' => $coords_array[0],
                'latitude' => $coords_array[1]
            );
            
            // Кешируем на 24 часа
            set_transient($cache_key, $coords, 86400);
            
            return $coords;
        }
        
        return false;
    }
    
    /**
     * Ищем пункты выдачи СДЭК
     */
    public function search_pickup_points($city) {
        $token = $this->get_cdek_token();
        if (!$token) {
            return false;
        }
        
        // Получаем координаты города
        $coords = $this->get_city_coordinates($city);
        if (!$coords) {
            return false;
        }
        
        $url = $this->cdek_api_url . 'deliverypoints?type=PVZ&longitude=' . $coords['longitude'] . '&latitude=' . $coords['latitude'] . '&radius=50';
        
        $response = wp_remote_get($url, array(
            'headers' => array(
                'Authorization' => 'Bearer ' . $token,
                'Content-Type' => 'application/json'
            ),
            'timeout' => 30
        ));
        
        if (is_wp_error($response)) {
            error_log('CDEK Points Error: ' . $response->get_error_message());
            return false;
        }
        
        $body = json_decode(wp_remote_retrieve_body($response), true);
        
        return $body;
    }
    
    /**
     * AJAX поиск пунктов выдачи
     */
    public function ajax_search_points() {
        try {
            check_ajax_referer('cdek_nonce', 'nonce');
            
            $address = sanitize_text_field($_POST['address']);
            
            // Извлекаем город из адреса
            $city = $this->extract_city_from_address($address);
            
            if (!$city) {
                wp_send_json_error('Не удалось определить город из адреса');
                return;
            }
            
            $points = $this->search_pickup_points($city);
            
            if ($points && is_array($points)) {
                wp_send_json_success($points);
            } else {
                wp_send_json_error('Не удалось найти пункты выдачи');
            }
        } catch (Exception $e) {
            error_log('CDEK AJAX Error: ' . $e->getMessage());
            wp_send_json_error('Произошла ошибка: ' . $e->getMessage());
        }
    }
    
    /**
     * Извлекаем город из адреса
     */
    private function extract_city_from_address($address) {
        // Простая логика извлечения города - берем первое слово
        $parts = explode(',', $address);
        if (count($parts) > 0) {
            $city = trim($parts[0]);
            // Убираем "г." если есть
            $city = preg_replace('/^г\.\s*/', '', $city);
            return $city;
        }
        
        // Если запятых нет, берем первое слово
        $words = explode(' ', trim($address));
        if (count($words) > 0) {
            $city = $words[0];
            $city = preg_replace('/^г\.\s*/', '', $city);
            return $city;
        }
        
        return false;
    }
    
    /**
     * Рассчитываем стоимость доставки
     */
    public function calculate_shipping_cost($package) {
        $token = $this->get_cdek_token();
        if (!$token) {
            return 0;
        }
        
        // Получаем общий вес товаров
        $total_weight = 0;
        foreach ($package['contents'] as $item) {
            $product = $item['data'];
            $weight = $product->get_weight();
            if ($weight) {
                $total_weight += $weight * $item['quantity'];
            }
        }
        
        // Если вес не указан, используем значение по умолчанию
        if (!$total_weight) {
            $total_weight = 500; // 500 грамм по умолчанию
        }
        
        // Получаем адрес доставки
        $destination = $package['destination'];
        $city = $this->extract_city_from_address($destination['address_1']);
        
        if (!$city) {
            return 0;
        }
        
        // Получаем код города СДЭК
        $city_code = $this->get_cdek_city_code($city);
        
        if (!$city_code) {
            return 0;
        }
        
        // Формируем запрос для расчета стоимости
        $calc_data = array(
            'type' => 1, // Доставка до ПВЗ
            'from_location' => array(
                'code' => 194 // Саратов
            ),
            'to_location' => array(
                'code' => $city_code
            ),
            'packages' => array(
                array(
                    'weight' => $total_weight,
                    'length' => 10,
                    'width' => 10,
                    'height' => 10
                )
            )
        );
        
        $response = wp_remote_post($this->cdek_api_url . 'calculator/tariff', array(
            'headers' => array(
                'Authorization' => 'Bearer ' . $token,
                'Content-Type' => 'application/json'
            ),
            'body' => json_encode($calc_data),
            'timeout' => 30
        ));
        
        if (is_wp_error($response)) {
            return 0;
        }
        
        $body = json_decode(wp_remote_retrieve_body($response), true);
        
        if (isset($body['delivery_sum'])) {
            return $body['delivery_sum'];
        }
        
        return 0;
    }
    
    /**
     * Получаем код города СДЭК
     */
    private function get_cdek_city_code($city) {
        $token = $this->get_cdek_token();
        if (!$token) {
            return false;
        }
        
        $cache_key = 'cdek_city_code_' . md5($city);
        $city_code = get_transient($cache_key);
        
        if ($city_code) {
            return $city_code;
        }
        
        $response = wp_remote_get($this->cdek_api_url . 'location/cities?city=' . urlencode($city), array(
            'headers' => array(
                'Authorization' => 'Bearer ' . $token
            ),
            'timeout' => 30
        ));
        
        if (is_wp_error($response)) {
            return false;
        }
        
        $body = json_decode(wp_remote_retrieve_body($response), true);
        
        if (isset($body[0]['code'])) {
            $city_code = $body[0]['code'];
            // Кешируем на 24 часа
            set_transient($cache_key, $city_code, 86400);
            return $city_code;
        }
        
        return false;
    }
    
    /**
     * Добавляем поле выбора пункта выдачи
     */
    public function add_cdek_pickup_field() {
        echo '<div id="cdek-pickup-selection" class="cdek-pickup-container">';
        echo '<h3>Выберите пункт выдачи СДЭК</h3>';
        echo '<div id="cdek-points-list"></div>';
        echo '<input type="hidden" name="cdek_pickup_point" id="cdek_pickup_point" value="">';
        echo '</div>';
    }
    
    /**
     * Сохраняем данные пункта выдачи
     */
    public function save_cdek_pickup_data($order_id) {
        if (isset($_POST['cdek_pickup_point']) && !empty($_POST['cdek_pickup_point'])) {
            update_post_meta($order_id, '_cdek_pickup_point', sanitize_text_field($_POST['cdek_pickup_point']));
        }
    }
    
    /**
     * Отображаем выбранный пункт выдачи в админке заказа
     */
    public function display_cdek_pickup_in_admin($order) {
        $pickup_point = get_post_meta($order->get_id(), '_cdek_pickup_point', true);
        if ($pickup_point) {
            echo '<p><strong>Пункт выдачи СДЭК:</strong> ' . esc_html($pickup_point) . '</p>';
        }
    }
}

// Регистрация метода доставки - КРИТИЧНО ВАЖНО!
function cdek_register_shipping_method($methods) {
    error_log('CDEK: Registering shipping method');
    $methods['cdek_shipping'] = 'WC_CDEK_Shipping_Method';
    return $methods;
}
add_filter('woocommerce_shipping_methods', 'cdek_register_shipping_method');

// Инициализация метода доставки
function cdek_shipping_method_init() {
    error_log('CDEK: Shipping method init called');
    if (!class_exists('WC_CDEK_Shipping_Method')) {
        error_log('CDEK: WC_CDEK_Shipping_Method class not found!');
    } else {
        error_log('CDEK: WC_CDEK_Shipping_Method class found');
    }
}
add_action('woocommerce_shipping_init', 'cdek_shipping_method_init');

// Глобальная переменная для доступа к экземпляру
global $cdek_integration_instance;

// Инициализируем интеграцию
function cdek_init_integration() {
    global $cdek_integration_instance;
    $cdek_integration_instance = new CDEK_WooCommerce_Integration();
    error_log('CDEK: Integration initialized');
}
add_action('plugins_loaded', 'cdek_init_integration');

// Добавляем контейнер в блок доставки для новых блоков checkout
add_action('wp_footer', function() {
    if (is_checkout()) {
        ?>
        <script>
        document.addEventListener('DOMContentLoaded', function() {
            let cdekContainerAdded = false;
            
            // Функция для добавления контейнера СДЭК в блок доставки
            function addCdekToShippingBlock() {
                if (cdekContainerAdded) return;
                
                // Ищем блок доставки
                const shippingBlock = document.querySelector('.wc-block-checkout__shipping-option .wc-block-components-checkout-step__container');
                if (!shippingBlock) {
                    setTimeout(addCdekToShippingBlock, 500);
                    return;
                }
                
                // Проверяем, не добавлен ли уже контейнер
                if (document.getElementById('cdek-shipping-container')) {
                    return;
                }
                
                // Создаем контейнер СДЭК
                const cdekDiv = document.createElement('div');
                cdekDiv.id = 'cdek-shipping-container';
                cdekDiv.className = 'cdek-shipping-container';
                cdekDiv.innerHTML = `
                    <h3>🚚 Пункты выдачи СДЭК</h3>
                    <div class="cdek-address-note">Пункты выдачи будут показаны после ввода адреса</div>
                    <div id="cdek-blocks-points-list"></div>
                    <input type="hidden" name="cdek_pickup_point" id="cdek-blocks-pickup-point" value="">
                `;
                
                // Добавляем контейнер в блок доставки
                shippingBlock.appendChild(cdekDiv);
                
                cdekContainerAdded = true;
                console.log('CDEK container added to shipping block');
            }
            
            // Запускаем добавление контейнера
            addCdekToShippingBlock();
            
            // Повторяем попытки
            setTimeout(addCdekToShippingBlock, 1000);
            setTimeout(addCdekToShippingBlock, 2000);
            setTimeout(addCdekToShippingBlock, 3000);
            
            // Наблюдаем за изменениями DOM
            const observer = new MutationObserver(function(mutations) {
                mutations.forEach(function(mutation) {
                    if (mutation.addedNodes.length > 0) {
                        setTimeout(addCdekToShippingBlock, 100);
                    }
                });
            });
            
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        });
        </script>
        <?php
    }
});

// Отладочная функция для проверки зарегистрированных методов доставки
add_action('admin_notices', function() {
    if (current_user_can('manage_options') && isset($_GET['cdek_debug'])) {
        $shipping_methods = WC()->shipping->get_shipping_methods();
        echo '<div class="notice notice-info"><p><strong>CDEK Debug:</strong><br>';
        echo 'Registered shipping methods: ' . implode(', ', array_keys($shipping_methods)) . '<br>';
        echo 'CDEK method exists: ' . (isset($shipping_methods['cdek_shipping']) ? 'Yes' : 'No') . '<br>';
        if (isset($shipping_methods['cdek_shipping'])) {
            echo 'CDEK method class: ' . get_class($shipping_methods['cdek_shipping']) . '<br>';
        }
        echo '</p></div>';
    }
});

// Временно добавляем debug notice
add_action('admin_notices', function() {
    if (current_user_can('manage_options')) {
        echo '<div class="notice notice-warning">';
        echo '<p><strong>CDEK Debug:</strong> Метод доставки регистрируется. ';
        echo '<a href="' . admin_url('admin.php?page=wc-settings&tab=shipping&cdek_debug=1') . '">Проверить статус</a></p>';
        echo '</div>';
    }
});