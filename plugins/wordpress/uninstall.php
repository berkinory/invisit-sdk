<?php
/**
 * Removes the plugin's settings when it is deleted from the Plugins screen. Analytics already
 * sent stay in the invisit account; deleting the site in the dashboard removes those.
 *
 * @package Invisit
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

if ( is_multisite() ) {
	$invisit_blog_ids = get_sites(
		array(
			'fields' => 'ids',
			'number' => 0,
		)
	);
	foreach ( $invisit_blog_ids as $invisit_blog_id ) {
		switch_to_blog( $invisit_blog_id );
		delete_option( 'invisit_settings' );
		restore_current_blog();
	}
} else {
	delete_option( 'invisit_settings' );
}
