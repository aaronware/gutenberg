/**
 * WordPress dependencies
 */
import {
	useContext,
	useEffect,
	useState,
	useMemo,
	createInterpolateElement,
} from '@wordpress/element';
import {
	__experimentalSpacer as Spacer,
	__experimentalInputControl as InputControl,
	__experimentalText as Text,
	__experimentalHStack as HStack,
	SelectControl,
	Spinner,
	Icon,
	FlexItem,
	Flex,
	Button,
	DropdownMenu,
} from '@wordpress/components';
import { debounce } from '@wordpress/compose';
import { sprintf, __, _x } from '@wordpress/i18n';
import { search, closeSmall, moreVertical } from '@wordpress/icons';

/**
 * Internal dependencies
 */
import TabPanelLayout from './tab-panel-layout';
import { FontLibraryContext } from './context';
import FontCard from './font-card';
import filterFonts from './utils/filter-fonts';
import CollectionFontDetails from './collection-font-details';
import { toggleFont } from './utils/toggleFont';
import { getFontsOutline } from './utils/fonts-outline';
import GoogleFontsConfirmDialog from './google-fonts-confirm-dialog';
import { downloadFontFaceAssets } from './utils';

const DEFAULT_CATEGORY = {
	slug: 'all',
	name: _x( 'All', 'font categories' ),
};

const LOCAL_STORAGE_ITEM = 'wp-font-library-google-fonts-permission';
const MIN_WINDOW_HEIGHT = 500;

function FontCollection( { slug } ) {
	const requiresPermission = slug === 'google-fonts';

	const getGoogleFontsPermissionFromStorage = () => {
		return window.localStorage.getItem( LOCAL_STORAGE_ITEM ) === 'true';
	};

	const [ selectedFont, setSelectedFont ] = useState( null );
	const [ fontsToInstall, setFontsToInstall ] = useState( [] );
	const [ page, setPage ] = useState( 1 );
	const [ filters, setFilters ] = useState( {} );
	const [ renderConfirmDialog, setRenderConfirmDialog ] = useState(
		requiresPermission && ! getGoogleFontsPermissionFromStorage()
	);
	const { collections, getFontCollection, installFont, notice, setNotice } =
		useContext( FontLibraryContext );
	const selectedCollection = collections.find(
		( collection ) => collection.slug === slug
	);

	useEffect( () => {
		const handleStorage = () => {
			setRenderConfirmDialog(
				requiresPermission && ! getGoogleFontsPermissionFromStorage()
			);
		};
		handleStorage();
		window.addEventListener( 'storage', handleStorage );
		return () => window.removeEventListener( 'storage', handleStorage );
	}, [ slug, requiresPermission ] );

	const revokeAccess = () => {
		window.localStorage.setItem( LOCAL_STORAGE_ITEM, 'false' );
		window.dispatchEvent( new Event( 'storage' ) );
	};

	useEffect( () => {
		const fetchFontCollection = async () => {
			try {
				await getFontCollection( slug );
				resetFilters();
			} catch ( e ) {
				if ( ! notice ) {
					setNotice( {
						type: 'error',
						message: e?.message,
					} );
				}
			}
		};
		fetchFontCollection();
	}, [ slug, getFontCollection, setNotice, notice ] );

	useEffect( () => {
		setSelectedFont( null );
		setNotice( null );
	}, [ slug, setNotice ] );

	useEffect( () => {
		// If the selected fonts change, reset the selected fonts to install
		setFontsToInstall( [] );
	}, [ selectedFont ] );

	const collectionFonts = useMemo(
		() => selectedCollection?.font_families ?? [],
		[ selectedCollection ]
	);
	const collectionCategories = selectedCollection?.categories ?? [];

	const categories = [ DEFAULT_CATEGORY, ...collectionCategories ];

	const fonts = useMemo(
		() => filterFonts( collectionFonts, filters ),
		[ collectionFonts, filters ]
	);

	// NOTE: The height of the font library modal unavailable to use for rendering font family items is roughly 417px
	// The height of each font family item is 61px.
	const windowHeight = Math.max( window.innerHeight, MIN_WINDOW_HEIGHT );
	const pageSize = Math.floor( ( windowHeight - 417 ) / 61 );
	const totalPages = Math.ceil( fonts.length / pageSize );
	const itemsStart = ( page - 1 ) * pageSize;
	const itemsLimit = page * pageSize;
	const items = fonts.slice( itemsStart, itemsLimit );

	const handleCategoryFilter = ( category ) => {
		setFilters( { ...filters, category } );
		setPage( 1 );
	};

	const handleUpdateSearchInput = ( value ) => {
		setFilters( { ...filters, search: value } );
		setPage( 1 );
	};

	const debouncedUpdateSearchInput = debounce( handleUpdateSearchInput, 300 );

	const resetFilters = () => {
		setFilters( {} );
		setPage( 1 );
	};

	const resetSearch = () => {
		setFilters( { ...filters, search: '' } );
		setPage( 1 );
	};

	const handleUnselectFont = () => {
		setSelectedFont( null );
	};

	const handleToggleVariant = ( font, face ) => {
		const newFontsToInstall = toggleFont( font, face, fontsToInstall );
		setFontsToInstall( newFontsToInstall );
	};

	const fontToInstallOutline = getFontsOutline( fontsToInstall );

	const resetFontsToInstall = () => {
		setFontsToInstall( [] );
	};

	const handleInstall = async () => {
		setNotice( null );

		const fontFamily = fontsToInstall[ 0 ];

		try {
			if ( fontFamily?.fontFace ) {
				await Promise.all(
					fontFamily.fontFace.map( async ( fontFace ) => {
						if ( fontFace.src ) {
							fontFace.file = await downloadFontFaceAssets(
								fontFace.src
							);
						}
					} )
				);
			}
		} catch ( error ) {
			// If any of the fonts fail to download,
			// show an error notice and stop the request from being sent.
			setNotice( {
				type: 'error',
				message: __(
					'Error installing the fonts, could not be downloaded.'
				),
			} );
			return;
		}

		try {
			await installFont( fontFamily );
			setNotice( {
				type: 'success',
				message: __( 'Fonts were installed successfully.' ),
			} );
		} catch ( error ) {
			setNotice( {
				type: 'error',
				message: error.message,
			} );
		}
		resetFontsToInstall();
	};

	let footerComponent = null;
	if ( selectedFont ) {
		footerComponent = (
			<InstallFooter
				handleInstall={ handleInstall }
				isDisabled={ fontsToInstall.length === 0 }
			/>
		);
	} else if ( ! renderConfirmDialog && totalPages > 1 ) {
		footerComponent = (
			<PaginationFooter
				page={ page }
				totalPages={ totalPages }
				setPage={ setPage }
			/>
		);
	}

	const ActionsComponent = () => {
		if ( slug !== 'google-fonts' || renderConfirmDialog || selectedFont ) {
			return null;
		}
		return (
			<DropdownMenu
				icon={ moreVertical }
				label={ __( 'Actions' ) }
				popoverProps={ {
					position: 'bottom left',
				} }
				controls={ [
					{
						title: __( 'Revoke access to Google Fonts' ),
						onClick: revokeAccess,
					},
				] }
			/>
		);
	};

	return (
		<TabPanelLayout
			title={
				! selectedFont ? selectedCollection.name : selectedFont.name
			}
			actions={ <ActionsComponent /> }
			description={
				! selectedFont
					? selectedCollection.description
					: __( 'Select font variants to install.' )
			}
			notice={ notice }
			handleBack={ !! selectedFont && handleUnselectFont }
			footer={ footerComponent }
		>
			{ renderConfirmDialog && (
				<>
					<Spacer margin={ 8 } />
					<GoogleFontsConfirmDialog />
				</>
			) }

			{ ! renderConfirmDialog && ! selectedFont && (
				<Flex>
					<FlexItem>
						<InputControl
							value={ filters.search }
							placeholder={ __( 'Font name…' ) }
							label={ __( 'Search' ) }
							onChange={ debouncedUpdateSearchInput }
							prefix={ <Icon icon={ search } /> }
							suffix={
								filters?.search ? (
									<Icon
										icon={ closeSmall }
										onClick={ resetSearch }
									/>
								) : null
							}
						/>
					</FlexItem>
					<FlexItem>
						<SelectControl
							label={ __( 'Category' ) }
							value={ filters.category }
							onChange={ handleCategoryFilter }
						>
							{ categories &&
								categories.map( ( category ) => (
									<option
										value={ category.slug }
										key={ category.slug }
									>
										{ category.name }
									</option>
								) ) }
						</SelectControl>
					</FlexItem>
				</Flex>
			) }

			<Spacer margin={ 4 } />
			{ ! renderConfirmDialog &&
				! selectedCollection?.font_families &&
				! notice && <Spinner /> }

			{ ! renderConfirmDialog &&
				!! selectedCollection?.font_families?.length &&
				! fonts.length && (
					<Text>
						{ __(
							'No fonts found. Try with a different search term'
						) }
					</Text>
				) }

			{ ! renderConfirmDialog && selectedFont && (
				<CollectionFontDetails
					font={ selectedFont }
					handleToggleVariant={ handleToggleVariant }
					fontToInstallOutline={ fontToInstallOutline }
				/>
			) }

			{ ! renderConfirmDialog && ! selectedFont && (
				<div className="font-library-modal__fonts-grid__main">
					{ items.map( ( font ) => (
						<FontCard
							key={ font.font_family_settings.slug }
							font={ font.font_family_settings }
							onClick={ () => {
								setSelectedFont( font.font_family_settings );
							} }
						/>
					) ) }
				</div>
			) }
		</TabPanelLayout>
	);
}

function PaginationFooter( { page, totalPages, setPage } ) {
	return (
		<Flex justify="center">
			<Button
				label={ __( 'First page' ) }
				size="compact"
				onClick={ () => setPage( 1 ) }
				disabled={ page === 1 }
				__experimentalIsFocusable
			>
				<span>«</span>
			</Button>
			<Button
				label={ __( 'Previous page' ) }
				size="compact"
				onClick={ () => setPage( page - 1 ) }
				disabled={ page === 1 }
				__experimentalIsFocusable
			>
				<span>‹</span>
			</Button>
			<HStack justify="flex-start" expanded={ false } spacing={ 2 }>
				{ createInterpolateElement(
					sprintf(
						// translators: %s: Total number of pages.
						_x( 'Page <CurrenPageControl /> of %s', 'paging' ),
						totalPages
					),
					{
						CurrenPageControl: (
							<SelectControl
								aria-label={ __( 'Current page' ) }
								value={ page }
								options={ [ ...Array( totalPages ) ].map(
									( e, i ) => {
										return {
											label: i + 1,
											value: i + 1,
										};
									}
								) }
								onChange={ ( newPage ) =>
									setPage( parseInt( newPage ) )
								}
								size={ 'compact' }
								__nextHasNoMarginBottom
							/>
						),
					}
				) }
			</HStack>
			<Button
				label={ __( 'Next page' ) }
				size="compact"
				onClick={ () => setPage( page + 1 ) }
				disabled={ page === totalPages }
				__experimentalIsFocusable
			>
				<span>›</span>
			</Button>
			<Button
				label={ __( 'Last page' ) }
				size="compact"
				onClick={ () => setPage( totalPages ) }
				disabled={ page === totalPages }
				__experimentalIsFocusable
			>
				<span>»</span>
			</Button>
		</Flex>
	);
}

function InstallFooter( { handleInstall, isDisabled } ) {
	const { isInstalling } = useContext( FontLibraryContext );

	return (
		<Flex justify="flex-end">
			<Button
				variant="primary"
				onClick={ handleInstall }
				isBusy={ isInstalling }
				disabled={ isDisabled || isInstalling }
				__experimentalIsFocusable
			>
				{ __( 'Install' ) }
			</Button>
		</Flex>
	);
}

export default FontCollection;
