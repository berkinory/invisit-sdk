<?php
/**
 * Plugin Name:       invisit
 * Description:       Cookieless, privacy-first web analytics. Adds the invisit tracker to your site and leaves out your own team.
 * Version:           1.0.0
 * Requires at least: 6.4
 * Requires PHP:      7.4
 * Author:            invisit
 * Author URI:        https://invisit.dev
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       invisit
 *
 * @package Invisit
 */

defined( 'ABSPATH' ) || exit;

define( 'INVISIT_VERSION', '1.0.0' );

require_once __DIR__ . '/includes/class-invisit-settings.php';
require_once __DIR__ . '/includes/class-invisit-tracker.php';

Invisit_Tracker::register();

if ( is_admin() ) {
	require_once __DIR__ . '/includes/class-invisit-admin-page.php';
	Invisit_Admin_Page::register( plugin_basename( __FILE__ ) );
}
