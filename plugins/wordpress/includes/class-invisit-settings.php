<?php
/**
 * The plugin's one option: what it holds, its defaults, and how input is checked before saving.
 *
 * @package Invisit
 */

defined( 'ABSPATH' ) || exit;

/**
 * Reads and validates the invisit_settings option.
 */
final class Invisit_Settings {

	const OPTION = 'invisit_settings';

	/*
	 * Site ids are UUIDv7, lowercase, as the collector checks them (packages/contracts, events.ts).
	 */
	const SITE_ID_PATTERN = '/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/';

	/*
	 * The tracker compares against location.pathname: an exact path, or a prefix ending in one
	 * trailing "*". Only URL path characters can match it, and commas separate entries in the
	 * data-exclude-paths attribute, so neither a comma nor an inner "*" is allowed.
	 */
	const EXCLUDE_PATH_PATTERN = '/^\/[A-Za-z0-9\-._~!$&\'()+;=:@%\/]*\*?$/';

	const MAX_EXCLUDE_PATHS = 50;

	const MAX_EXCLUDE_PATH_LENGTH = 200;

	/**
	 * Settings a fresh install starts with. Outbound links and file downloads match the tracker's
	 * own defaults; editors and administrators are left out so the site's team is not counted.
	 *
	 * @return array<string, mixed>
	 */
	public static function defaults() {
		return array(
			'site_id'         => '',
			'excluded_roles'  => array( 'administrator', 'editor' ),
			'outbound_links'  => true,
			'file_downloads'  => true,
			'respect_gpc'     => false,
			'respect_dnt'     => false,
			'require_consent' => false,
			'no_storage'      => false,
			'exclude_paths'   => array(),
		);
	}

	/**
	 * The saved settings, with defaults for anything missing.
	 *
	 * @return array<string, mixed>
	 */
	public static function get() {
		$saved = get_option( self::OPTION, array() );
		return wp_parse_args( is_array( $saved ) ? $saved : array(), self::defaults() );
	}

	/**
	 * Sanitize callback for register_setting(). An invalid value is reported and the field keeps
	 * its previous value, so one typo never wipes a working setup.
	 *
	 * It must accept its own output: when update_option() falls through to add_option(), as it
	 * does for an option still at its default, WordPress runs the callback a second time on the
	 * already sanitized value.
	 *
	 * @param mixed $input Raw value from the settings form.
	 * @return array<string, mixed>
	 */
	public static function sanitize( $input ) {
		$previous = self::get();
		$input    = is_array( $input ) ? $input : array();

		return array(
			'site_id'         => self::sanitize_site_id( $input, $previous['site_id'] ),
			'excluded_roles'  => self::sanitize_roles( $input ),
			'outbound_links'  => ! empty( $input['outbound_links'] ),
			'file_downloads'  => ! empty( $input['file_downloads'] ),
			'respect_gpc'     => ! empty( $input['respect_gpc'] ),
			'respect_dnt'     => ! empty( $input['respect_dnt'] ),
			'require_consent' => ! empty( $input['require_consent'] ),
			'no_storage'      => ! empty( $input['no_storage'] ),
			'exclude_paths'   => self::sanitize_exclude_paths( $input, $previous['exclude_paths'] ),
		);
	}

	/**
	 * Checks the site id against the format the collector accepts.
	 *
	 * @param array<string, mixed> $input    Raw form values.
	 * @param string               $previous Site id saved before this request.
	 * @return string
	 */
	private static function sanitize_site_id( array $input, $previous ) {
		$raw     = isset( $input['site_id'] ) && is_string( $input['site_id'] ) ? $input['site_id'] : '';
		$site_id = strtolower( trim( sanitize_text_field( $raw ) ) );

		if ( '' === $site_id || preg_match( self::SITE_ID_PATTERN, $site_id ) ) {
			return $site_id;
		}

		add_settings_error(
			self::OPTION,
			'invisit_site_id',
			__( 'That site ID does not look right. Copy it from Settings, Installation in your invisit dashboard. It is 36 characters long, like 0192f3a1-7c4e-7d2a-9b1f-3e5a6c7d8e9f.', 'invisit' )
		);
		return $previous;
	}

	/**
	 * Keeps only roles that exist on this site.
	 *
	 * @param array<string, mixed> $input Raw form values.
	 * @return string[]
	 */
	private static function sanitize_roles( array $input ) {
		$raw = isset( $input['excluded_roles'] ) && is_array( $input['excluded_roles'] ) ? $input['excluded_roles'] : array();

		$roles = array_map( 'sanitize_key', array_filter( $raw, 'is_string' ) );
		$known = array_keys( wp_roles()->get_names() );

		return array_values( array_unique( array_intersect( $roles, $known ) ) );
	}

	/**
	 * Splits the paths field on commas or new lines and checks each entry.
	 *
	 * @param array<string, mixed> $input    Raw form values, or an already sanitized list.
	 * @param string[]             $previous Paths saved before this request.
	 * @return string[]
	 */
	private static function sanitize_exclude_paths( array $input, array $previous ) {
		$raw = isset( $input['exclude_paths'] ) ? $input['exclude_paths'] : '';
		if ( is_array( $raw ) ) {
			$raw = implode( "\n", array_filter( $raw, 'is_string' ) );
		}
		if ( ! is_string( $raw ) ) {
			$raw = '';
		}

		/*
		 * Not sanitize_textarea_field(): it strips percent-encoded octets, which would turn a saved
		 * /%C3%BCber into /ber on the next save. Every entry is checked against a strict pattern
		 * below instead, which admits no markup.
		 */
		$entries = preg_split( '/[\s,]+/', wp_check_invalid_utf8( $raw ), -1, PREG_SPLIT_NO_EMPTY );
		$paths   = array_values( array_unique( array_map( array( __CLASS__, 'encode_path' ), $entries ? $entries : array() ) ) );

		if ( count( $paths ) > self::MAX_EXCLUDE_PATHS ) {
			add_settings_error(
				self::OPTION,
				'invisit_exclude_paths',
				sprintf(
					/* translators: %d: the largest number of paths allowed. */
					__( 'You can exclude at most %d paths. Your previous list was kept.', 'invisit' ),
					self::MAX_EXCLUDE_PATHS
				)
			);
			return $previous;
		}

		foreach ( $paths as $path ) {
			if ( strlen( $path ) > self::MAX_EXCLUDE_PATH_LENGTH || ! preg_match( self::EXCLUDE_PATH_PATTERN, $path ) ) {
				add_settings_error(
					self::OPTION,
					'invisit_exclude_paths',
					sprintf(
						/* translators: %s: the path that was rejected. */
						__( '"%s" is not a path invisit can exclude. Each path starts with a slash, and only a single * at the end is allowed, as in /cart or /my-account/*. Your previous list was kept.', 'invisit' ),
						// settings_errors() prints messages as HTML, unescaped.
						esc_html( $path )
					)
				);
				return $previous;
			}
		}

		return $paths;
	}

	/**
	 * Percent-encodes non-ASCII characters the way browsers report them in location.pathname, so
	 * a path typed as /über matches the page the tracker sees as /%C3%BCber.
	 *
	 * @param string $path Path as typed.
	 * @return string
	 */
	private static function encode_path( $path ) {
		return (string) preg_replace_callback(
			'/[^\x00-\x7F]+/',
			static function ( $matches ) {
				return rawurlencode( $matches[0] );
			},
			$path
		);
	}
}
