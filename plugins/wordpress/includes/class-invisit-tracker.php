<?php
/**
 * Prints the invisit tracker on front-end pages.
 *
 * @package Invisit
 */

defined( 'ABSPATH' ) || exit;

/**
 * Enqueues the hosted tracker and adds its data-* settings to the tag.
 */
final class Invisit_Tracker {

	const HANDLE = 'invisit';

	const COLLECTOR_URL = 'https://api.invisit.dev';

	const SCRIPT_URL = 'https://api.invisit.dev/invisit.js';

	/*
	 * WordPress gives an enqueued script the id "<handle>-js"; the attribute filter matches on it.
	 */
	const TAG_ID = 'invisit-js';

	/**
	 * Hooks into the front end.
	 */
	public static function register() {
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue' ) );
		add_filter( 'wp_script_attributes', array( __CLASS__, 'add_attributes' ) );
	}

	/**
	 * Enqueues the tracker unless there is no site id yet or the visitor is one of the excluded
	 * roles. The check runs per request, so a page cache that serves signed-in users the same
	 * HTML as everyone else will undo it.
	 */
	public static function enqueue() {
		$settings = Invisit_Settings::get();
		if ( '' === $settings['site_id'] || is_customize_preview() || self::is_excluded_user( $settings['excluded_roles'] ) ) {
			return;
		}

		/*
		 * No version: the URL always serves the current tracker release with its own caching
		 * headers, and a ?ver= query would only split the CDN cache by WordPress version.
		 */
		wp_enqueue_script(
			self::HANDLE,
			self::SCRIPT_URL,
			array(),
			null, // phpcs:ignore WordPress.WP.EnqueuedResourceParameters.MissingVersion -- see above.
			array(
				'strategy'  => 'async',
				'in_footer' => false,
			)
		);
	}

	/**
	 * Adds the tracker's settings to its tag. WordPress escapes every attribute value when it
	 * prints the tag, and writes them in alphabetical order, so data-cfasync lands before src as
	 * Cloudflare Rocket Loader requires.
	 *
	 * @param array<string, string|bool> $attributes Attributes WordPress is about to print.
	 * @return array<string, string|bool>
	 */
	public static function add_attributes( $attributes ) {
		if ( ! is_array( $attributes ) || ! isset( $attributes['id'] ) || self::TAG_ID !== $attributes['id'] ) {
			return $attributes;
		}
		return array_merge( $attributes, self::tracker_attributes( Invisit_Settings::get() ) );
	}

	/**
	 * The data-* attributes the tracker reads from its own tag (apps/tracker/src/install.ts).
	 * Options left at the tracker's default are not written.
	 *
	 * @param array<string, mixed> $settings Saved settings.
	 * @return array<string, string>
	 */
	private static function tracker_attributes( array $settings ) {
		$attributes = array(
			'data-site'      => $settings['site_id'],
			'data-collector' => self::COLLECTOR_URL,
			// Cloudflare Rocket Loader and LiteSpeed Cache leave a script with this attribute alone.
			'data-cfasync'   => 'false',
		);

		if ( ! $settings['outbound_links'] ) {
			$attributes['data-outbound-links'] = 'false';
		}
		if ( ! $settings['file_downloads'] ) {
			$attributes['data-file-downloads'] = 'false';
		}
		if ( $settings['respect_gpc'] ) {
			$attributes['data-respect-gpc'] = 'true';
		}
		if ( $settings['respect_dnt'] ) {
			$attributes['data-respect-dnt'] = 'true';
		}
		if ( $settings['require_consent'] ) {
			$attributes['data-require-consent'] = 'true';
		}
		if ( $settings['no_storage'] ) {
			$attributes['data-storage'] = 'none';
		}
		if ( ! empty( $settings['exclude_paths'] ) ) {
			$attributes['data-exclude-paths'] = implode( ',', $settings['exclude_paths'] );
		}

		return $attributes;
	}

	/**
	 * Whether the signed-in user has one of the roles that should not be counted. A network super
	 * admin may hold no role on a given site, so they count as an administrator here.
	 *
	 * @param string[] $excluded_roles Roles to leave out.
	 * @return bool
	 */
	private static function is_excluded_user( array $excluded_roles ) {
		if ( empty( $excluded_roles ) || ! is_user_logged_in() ) {
			return false;
		}
		if ( array_intersect( (array) wp_get_current_user()->roles, $excluded_roles ) ) {
			return true;
		}
		return is_multisite() && is_super_admin() && in_array( 'administrator', $excluded_roles, true );
	}
}
