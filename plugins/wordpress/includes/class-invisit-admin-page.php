<?php
/**
 * The Settings > invisit screen.
 *
 * @package Invisit
 */

defined( 'ABSPATH' ) || exit;

/**
 * Registers the settings page and renders its fields through the Settings API, which handles the
 * nonce and the manage_options check on save.
 */
final class Invisit_Admin_Page {

	const PAGE = 'invisit';

	const GROUP = 'invisit';

	const DASHBOARD_URL = 'https://app.invisit.dev';

	/**
	 * Hooks the page into wp-admin.
	 *
	 * @param string $plugin_basename Basename of the main plugin file, for the Plugins screen link.
	 */
	public static function register( $plugin_basename ) {
		add_action( 'admin_menu', array( __CLASS__, 'add_page' ) );
		add_action( 'admin_init', array( __CLASS__, 'register_settings' ) );
		add_filter( 'plugin_action_links_' . $plugin_basename, array( __CLASS__, 'add_action_link' ) );
	}

	/**
	 * Adds Settings > invisit.
	 */
	public static function add_page() {
		add_options_page(
			__( 'invisit settings', 'invisit' ),
			'invisit',
			'manage_options',
			self::PAGE,
			array( __CLASS__, 'render' )
		);
	}

	/**
	 * Adds a Settings link next to Deactivate on the Plugins screen.
	 *
	 * @param string[] $links Existing action links.
	 * @return string[]
	 */
	public static function add_action_link( $links ) {
		$url = admin_url( 'options-general.php?page=' . self::PAGE );
		array_unshift( $links, '<a href="' . esc_url( $url ) . '">' . esc_html__( 'Settings', 'invisit' ) . '</a>' );
		return $links;
	}

	/**
	 * Registers the option, its sections and its fields.
	 */
	public static function register_settings() {
		register_setting(
			self::GROUP,
			Invisit_Settings::OPTION,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( 'Invisit_Settings', 'sanitize' ),
			)
		);

		add_settings_section( 'invisit_site', __( 'Site', 'invisit' ), '__return_false', self::PAGE );
		add_settings_field(
			'invisit_site_id',
			__( 'Site ID', 'invisit' ),
			array( __CLASS__, 'render_site_id' ),
			self::PAGE,
			'invisit_site',
			array( 'label_for' => 'invisit_site_id' )
		);

		add_settings_section( 'invisit_people', __( 'Who is counted', 'invisit' ), '__return_false', self::PAGE );
		add_settings_field( 'invisit_excluded_roles', __( 'Not counted when signed in', 'invisit' ), array( __CLASS__, 'render_roles' ), self::PAGE, 'invisit_people' );

		add_settings_section( 'invisit_privacy', __( 'Privacy', 'invisit' ), '__return_false', self::PAGE );
		add_settings_field( 'invisit_privacy_options', __( 'Visitor choices', 'invisit' ), array( __CLASS__, 'render_privacy' ), self::PAGE, 'invisit_privacy' );

		add_settings_section( 'invisit_tracking', __( 'What is recorded', 'invisit' ), '__return_false', self::PAGE );
		add_settings_field( 'invisit_clicks', __( 'Clicks', 'invisit' ), array( __CLASS__, 'render_clicks' ), self::PAGE, 'invisit_tracking' );
		add_settings_field(
			'invisit_exclude_paths',
			__( 'Paths never measured', 'invisit' ),
			array( __CLASS__, 'render_exclude_paths' ),
			self::PAGE,
			'invisit_tracking',
			array( 'label_for' => 'invisit_exclude_paths' )
		);
	}

	/**
	 * Renders the page.
	 */
	public static function render() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		$settings = Invisit_Settings::get();
		?>
		<div class="wrap">
			<h1><?php echo esc_html( get_admin_page_title() ); ?></h1>
			<?php if ( '' === $settings['site_id'] ) : ?>
				<div class="notice notice-info inline">
					<p>
						<?php
						printf(
							/* translators: %s: link to the invisit dashboard. */
							esc_html__( 'Add your site ID to start counting visits. Create a site in the %s, then copy its ID from Settings, Installation.', 'invisit' ),
							'<a href="' . esc_url( self::DASHBOARD_URL ) . '" target="_blank" rel="noopener noreferrer">' . esc_html__( 'invisit dashboard', 'invisit' ) . '</a>'
						);
						?>
					</p>
				</div>
			<?php endif; ?>
			<form action="options.php" method="post">
				<?php
				settings_fields( self::GROUP );
				do_settings_sections( self::PAGE );
				submit_button();
				?>
			</form>
		</div>
		<?php
	}

	/**
	 * Site ID input.
	 */
	public static function render_site_id() {
		$settings = Invisit_Settings::get();
		printf(
			'<input type="text" id="invisit_site_id" name="%1$s" value="%2$s" class="regular-text code" spellcheck="false" autocomplete="off" />',
			esc_attr( self::field_name( 'site_id' ) ),
			esc_attr( $settings['site_id'] )
		);
		echo '<p class="description">' . esc_html__( 'In the invisit dashboard, under Settings, Installation. It is public, so it is safe to show in your pages.', 'invisit' ) . '</p>';
	}

	/**
	 * One checkbox per role.
	 */
	public static function render_roles() {
		$settings = Invisit_Settings::get();
		echo '<fieldset><legend class="screen-reader-text">' . esc_html__( 'Roles that are not counted', 'invisit' ) . '</legend>';
		foreach ( wp_roles()->get_names() as $role => $name ) {
			self::render_checkbox(
				self::field_name( 'excluded_roles' ) . '[]',
				in_array( $role, $settings['excluded_roles'], true ),
				translate_user_role( $name ),
				$role
			);
		}
		echo '</fieldset>';
		echo '<p class="description">' . esc_html__( 'Signed-in users with a ticked role get no tracker, so your own team browsing the site is not counted. Logged-out visitors are always counted. If a page cache serves signed-in users the same pages as everyone else, open the site once with #invisit-ignore at the end of the address instead.', 'invisit' ) . '</p>';
	}

	/**
	 * Global Privacy Control, Do Not Track, consent and storage.
	 */
	public static function render_privacy() {
		$settings = Invisit_Settings::get();
		echo '<fieldset><legend class="screen-reader-text">' . esc_html__( 'Visitor choices', 'invisit' ) . '</legend>';
		self::render_checkbox( self::field_name( 'respect_gpc' ), $settings['respect_gpc'], __( 'Do not count browsers that send Global Privacy Control', 'invisit' ) );
		self::render_checkbox( self::field_name( 'respect_dnt' ), $settings['respect_dnt'], __( 'Do not count browsers that send Do Not Track', 'invisit' ) );
		self::render_checkbox( self::field_name( 'require_consent' ), $settings['require_consent'], __( 'Wait for consent before sending anything', 'invisit' ) );
		self::render_checkbox( self::field_name( 'no_storage' ), $settings['no_storage'], __( 'Keep nothing on the visitor\'s device', 'invisit' ) );
		echo '</fieldset>';
		echo '<p class="description">' . esc_html__( 'invisit sets no cookies either way. With consent turned on, nothing is sent until your consent tool calls invisit.consent(\'granted\') in the page. Keeping nothing on the device also means a consent answer and #invisit-ignore are forgotten between page loads.', 'invisit' ) . '</p>';
	}

	/**
	 * Outbound link and file download clicks.
	 */
	public static function render_clicks() {
		$settings = Invisit_Settings::get();
		echo '<fieldset><legend class="screen-reader-text">' . esc_html__( 'Clicks', 'invisit' ) . '</legend>';
		self::render_checkbox( self::field_name( 'outbound_links' ), $settings['outbound_links'], __( 'Record clicks on links to other sites', 'invisit' ) );
		self::render_checkbox( self::field_name( 'file_downloads' ), $settings['file_downloads'], __( 'Record clicks on file downloads', 'invisit' ) );
		echo '</fieldset>';
	}

	/**
	 * Paths the tracker never measures.
	 */
	public static function render_exclude_paths() {
		$settings = Invisit_Settings::get();
		printf(
			'<textarea id="invisit_exclude_paths" name="%1$s" rows="4" class="large-text code" spellcheck="false">%2$s</textarea>',
			esc_attr( self::field_name( 'exclude_paths' ) ),
			esc_textarea( implode( "\n", $settings['exclude_paths'] ) )
		);
		echo '<p class="description">' . esc_html__( 'One path per line. /cart leaves out only /cart; /my-account/* leaves out everything under /my-account/.', 'invisit' ) . '</p>';
	}

	/**
	 * The form name for a key inside the plugin's option.
	 *
	 * @param string $key Field key.
	 * @return string
	 */
	private static function field_name( $key ) {
		return Invisit_Settings::OPTION . '[' . $key . ']';
	}

	/**
	 * A labelled checkbox.
	 *
	 * @param string $name    Form field name.
	 * @param bool   $checked Whether the box is ticked.
	 * @param string $label   Visible label, not yet escaped.
	 * @param string $value   Value posted when ticked.
	 */
	private static function render_checkbox( $name, $checked, $label, $value = '1' ) {
		printf(
			'<label><input type="checkbox" name="%1$s" value="%2$s" %3$s /> %4$s</label><br />',
			esc_attr( $name ),
			esc_attr( $value ),
			checked( $checked, true, false ),
			esc_html( $label )
		);
	}
}
